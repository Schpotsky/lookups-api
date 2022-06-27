/**
 * Initialize and export all entities used by the application.
 */

const config = require('config')

const entities = {}
// table name is the entity name
entities[config.AMAZON.DYNAMODB_COUNTRY_TABLE] = require('./Country')
entities[config.AMAZON.DYNAMODB_EDUCATIONAL_INSTITUTION_TABLE] = require('./EducationalInstitution')
entities[config.AMAZON.DYNAMODB_DEVICE_TABLE] = require('./Device')

module.exports = entities
