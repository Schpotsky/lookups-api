/**
 * This file defines helper methods
 */
const _ = require('lodash')
const querystring = require('querystring')
const config = require('config')
const AWS = require('aws-sdk')
const elasticsearch = require('elasticsearch')
const entities = require('../entities')
const errors = require('./errors')
const logger = require('./logger')
const { getDatabaseService } = require('tc-dal')
const { DATABASE_TYPE } = require('../../app-constants')
const busApi = require('tc-bus-api-wrapper')
const busApiClient = busApi(_.pick(config, ['AUTH0_URL', 'AUTH0_AUDIENCE', 'TOKEN_CACHE_TIME', 'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET', 'BUSAPI_URL', 'KAFKA_ERROR_TOPIC']))

const index = {
  country: config.get('ES.COUNTRY_INDEX'),
  device: config.get('ES.DEVICE_INDEX'),
  educationalInstitution: config.get('ES.EDUCATIONAL_INSTITUTION_INDEX')
}
const type = {
  country: config.get('ES.COUNTRY_TYPE'),
  device: config.get('ES.DEVICE_TYPE'),
  educationalInstitution: config.get('ES.EDUCATIONAL_INSTITUTION_TYPE')
}
// AWS DynamoDB instance
let dbInstance

// Elasticsearch client
let esClient

// The service to use to interact with the database
let databaseService

AWS.config.update({
  // accessKeyId: config.AMAZON.AWS_ACCESS_KEY_ID,
  // secretAccessKey: config.AMAZON.AWS_SECRET_ACCESS_KEY,
  region: config.AMAZON.AWS_REGION
})

const MODEL_TO_ES_INDEX_MAP = {
  [config.AMAZON.DYNAMODB_DEVICE_TABLE]: config.ES.DEVICE_INDEX,
  [config.AMAZON.DYNAMODB_COUNTRY_TABLE]: config.ES.COUNTRY_INDEX,
  [config.AMAZON.DYNAMODB_EDUCATIONAL_INSTITUTION_TABLE]: config.ES.EDUCATIONAL_INSTITUTION_INDEX
}

const MODEL_TO_ES_TYPE_MAP = {
  [config.AMAZON.DYNAMODB_DEVICE_TABLE]: config.ES.DEVICE_TYPE,
  [config.AMAZON.DYNAMODB_COUNTRY_TABLE]: config.ES.COUNTRY_TYPE,
  [config.AMAZON.DYNAMODB_EDUCATIONAL_INSTITUTION_TABLE]: config.ES.EDUCATIONAL_INSTITUTION_TYPE
}

/**
 * Wrap async function to standard express function
 * @param {Function} fn the async function
 * @returns {Function} the wrapped function
 */
function wrapExpress (fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next)
  }
}

/**
 * Wrap all functions from object
 * @param obj the object (controller exports)
 * @returns {Object|Array} the wrapped object
 */
function autoWrapExpress (obj) {
  if (_.isArray(obj)) {
    return obj.map(autoWrapExpress)
  }
  if (_.isFunction(obj)) {
    if (obj.constructor.name === 'AsyncFunction') {
      return wrapExpress(obj)
    }
    return obj
  }
  _.each(obj, (value, key) => {
    obj[key] = autoWrapExpress(value)
  })
  return obj
}

/**
 * Get DynamoDB Connection Instance
 * @return {Object} DynamoDB Connection Instance
 */
function getDb () {
  // cache it for better performance
  if (!dbInstance) {
    if (config.AMAZON.IS_LOCAL_DB) {
      dbInstance = new AWS.DynamoDB({ endpoint: config.AMAZON.DYNAMODB_URL })
    } else {
      dbInstance = new AWS.DynamoDB()
    }
  }
  return dbInstance
}

/**
 * Creates table in DynamoDB
 * @param     {object} model Table structure in JSON format
 * @return    {promise} the result
 */
async function createTable (model) {
  const db = getDb()
  return new Promise((resolve, reject) => {
    db.createTable(model, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Deletes table in DynamoDB
 * @param     {String} tableName Name of the table to be deleted
 * @return    {promise} the result
 */
async function deleteTable (tableName) {
  const db = getDb()
  const item = {
    TableName: tableName
  }
  return new Promise((resolve, reject) => {
    db.deleteTable(item, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * Removes an item from the database, it supports hard and soft delete.
 * If destroy == true, then the item is hard-deleted otherwise it is soft-deleted
 *
 * @param {Object} dbItem The database object to remove
 * @param {Boolean} destroy The flag indicating whether to hard delete (destroy == true) or soft delete the item
 * @returns
 */
async function remove (dbItem, destroy) {
  if (destroy) {
    return databaseService.delete(dbItem)
  } else {
    return databaseService.update(dbItem, { isDeleted: true })
  }
}

/**
 * Get ES Client
 * @return {Object} Elasticsearch Client Instance
 */
function getESClient () {
  if (esClient) {
    return esClient
  }
  const hosts = config.ES.HOST
  const apiVersion = config.ES.API_VERSION
  esClient = new elasticsearch.Client({
    apiVersion,
    hosts
  })
  return esClient
}

async function getEntity (modelName, id, query, authUser) {
  let recordIsSoftDeleted = false
  let result
  // first try to get from ES
  const isAdminUser = isAdmin(authUser)

  if (!_.isNil(query.includeSoftDeleted) && query.includeSoftDeleted) {
    if (!isAdminUser) {
      throw new errors.ForbiddenError('You are not allowed to perform that action')
    }
  }

  try {
    const client = await getESClient()
    const sourceParams = {
      index: MODEL_TO_ES_INDEX_MAP[modelName],
      type: MODEL_TO_ES_TYPE_MAP[modelName],
      id
    }

    result = await client.getSource(sourceParams)

    if (
      !isAdminUser ||
      _.isNil(query.includeSoftDeleted) ||
      (isAdmin && !query.includeSoftDeleted)) {
      // We should not return the record if the record is soft deleted
      if (result.isDeleted) {
        recordIsSoftDeleted = true
      }
    } else if (!(isAdmin && !_.isNil(query.includeSoftDeleted))) {
      delete result.isDeleted
    }
  } catch (e) {
    // log and ignore
    logger.logFullError(e)
  }

  if (recordIsSoftDeleted) {
    throw new errors.NotFoundError(`${modelName} with id: ${id} doesn't exist`)
  } else if (result) {
    return result
  }

  result = await databaseService.getById(modelName, id)

  if (
    !isAdminUser ||
    _.isNil(query.includeSoftDeleted) ||
    (isAdmin && !query.includeSoftDeleted)) {
    // We should not return the record if the record is soft deleted
    if (result.isDeleted) {
      throw new errors.NotFoundError(`${modelName} with id: ${id} doesn't exist`)
    }
  } else if (!(isAdmin && !_.isNil(query.includeSoftDeleted))) {
    delete result.isDeleted
  }

  // then try to get from DB
  return result
}

/**
 * Create Elasticsearch index, it will be deleted and re-created if present.
 * @param {String} indexName the ES index name
 * @param {String} typeName the ES index type name
 * @param {Array} fields the indexed fields
 */
async function createESIndex (indexName, typeName, fields) {
  const client = getESClient()
  // delete index if present
  try {
    await client.indices.delete({ index: indexName })
  } catch (err) {
    // ignore
  }

  // prepare props
  const props = {}
  for (const field of fields) {
    props[field] = {
      type: 'keyword'
    }
  }

  const ind = {
    index: indexName,
    body: {
      mappings: {
        [typeName]: {
          properties: props
        }
      }
    }
  }
  // create index
  await client.indices.create(ind)
}

/**
 * Get link for a given page.
 * @param {Object} req the HTTP request
 * @param {Number} page the page number
 * @returns {String} link for the page
 */
function getPageLink (req, page) {
  const q = _.assignIn({}, req.query, { page })
  return `${req.protocol}://${req.get('Host')}${req.baseUrl}${req.path}?${querystring.stringify(q)}`
}

/**
 * Set HTTP response headers from result.
 * @param {Object} req the HTTP request
 * @param {Object} res the HTTP response
 * @param {Object} result the operation result
 */
function setResHeaders (req, res, result) {
  // if result is got from db, then do not set response headers
  if (result.fromDB) {
    return
  }

  const totalPages = Math.ceil(result.total / result.perPage)
  if (result.page > 1) {
    res.set('X-Prev-Page', result.page - 1)
  }
  if (result.page < totalPages) {
    res.set('X-Next-Page', result.page + 1)
  }
  res.set('X-Page', result.page)
  res.set('X-Per-Page', result.perPage)
  res.set('X-Total', result.total)
  res.set('X-Total-Pages', totalPages)
  // set Link header
  if (totalPages > 0) {
    let link = `<${getPageLink(req, 1)}>; rel="first", <${getPageLink(req, totalPages)}>; rel="last"`
    if (result.page > 1) {
      link += `, <${getPageLink(req, result.page - 1)}>; rel="prev"`
    }
    if (result.page < totalPages) {
      link += `, <${getPageLink(req, result.page + 1)}>; rel="next"`
    }
    res.set('Link', link)
  }

  // Allow browsers access pagination data in headers
  let accessControlExposeHeaders = res.get('Access-Control-Expose-Headers') || ''
  accessControlExposeHeaders += accessControlExposeHeaders ? ', ' : ''
  // append new values, to not override values set by someone else
  accessControlExposeHeaders += 'X-Page, X-Per-Page, X-Total, X-Total-Pages, X-Prev-Page, X-Next-Page'

  res.set('Access-Control-Expose-Headers', accessControlExposeHeaders)
}

/**
 * Send Kafka event message
 * @params {String} topic the topic name
 * @params {Object} payload the payload
 */
async function postEvent (topic, payload) {
  logger.info(`Publish event to Kafka topic ${topic}`)
  const message = {
    topic,
    originator: config.KAFKA_MESSAGE_ORIGINATOR,
    timestamp: new Date().toISOString(),
    'mime-type': 'application/json',
    payload
  }
  logger.info(`posting message to bus api  ${message}`)
  await busApiClient.postEvent(message)
}

/**
 * Throws error if user is not admin
 * @param {Object} authUser The user making the request
 */
function isAdmin (authUser) {
  if (!authUser) {
    return false
  } else if (!authUser.scopes) {
    // Not a machine user
    const admin = _.filter(authUser.roles, role => role.toLowerCase() === 'Administrator'.toLowerCase())

    if (admin.length === 0) {
      return false
    }
  }

  return true
}

/**
 * Removes the attribute `isDeleted` from the result
 * @param {Object|Array} result The result data set
 * @param {Boolean} fromDB Is the result from database
 */
function sanitizeResult (result, fromDB) {
  if (fromDB) {
    // Dynamoose returns the result as an array hash of the models type
    result = JSON.parse(JSON.stringify(result))
  }

  if (_.isPlainObject(result)) {
    delete result.isDeleted
  } else if (_.isArray(result)) {
    for (let i = 0; i < result.length; i++) {
      delete result[i].isDeleted
    }
  }

  return result
}

/**
 * Send error event to Kafka
 * @params {String} topic the topic name
 * @params {Object} payload the payload
 * @params {String} action for which operation error occurred
 */
async function publishError (topic, payload, action) {
  _.set(payload, 'apiAction', action)
  const message = {
    topic,
    originator: config.KAFKA_MESSAGE_ORIGINATOR,
    timestamp: new Date().toISOString(),
    'mime-type': 'application/json',
    payload
  }
  logger.debug(`Publish error to Kafka topic ${topic}, ${JSON.stringify(message, null, 2)}`)
  await busApiClient.postEvent(message)
}

/**
 * Get The database service to use to interact with the DB
 * @return {Object} The databaseService instance
 */
function getDatabaseServiceInstance () {
  if (databaseService) {
    return databaseService
  }
  // See supported aws config at: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property

  const databaseServiceConfig = {
    awsConfig: {
      accessKeyId: config.AMAZON.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AMAZON.AWS_SECRET_ACCESS_KEY,
      region: config.AMAZON.AWS_REGION
      // maxRetries: 10
    },
    isLocalDB: config.AMAZON.IS_LOCAL_DB,
    localDatabaseURL: config.AMAZON.DYNAMODB_URL,
    dynamooseDefaults: { // The values in this configuration parameter need to be extracted to app configuration
      create: false,
      update: false,
      waitForActive: false
    },
    entities
  }

  databaseService = getDatabaseService(DATABASE_TYPE, databaseServiceConfig)
  return databaseService
}

module.exports = {
  wrapExpress,
  autoWrapExpress,
  createTable,
  deleteTable,
  getEntity,
  remove,
  getESClient,
  createESIndex,
  setResHeaders,
  postEvent,
  isAdmin,
  sanitizeResult,
  index,
  type,
  publishError,
  getDatabaseServiceInstance
}
