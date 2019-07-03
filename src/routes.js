/**
 * Contains all routes.
 * If access roles are not configured for a route, then any role is allowed.
 * If scopes are not configured for a route, then any scope is allowed.
 */

const constants = require('../app-constants')

module.exports = {
  '/lookups/countries': {
    get: {
      controller: 'CountryController',
      method: 'list',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    head: {
      controller: 'CountryController',
      method: 'listHead',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    post: {
      controller: 'CountryController',
      method: 'create',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.CreateLookup, constants.Scopes.AllLookup]
    }
  },
  '/lookups/countries/:id': {
    get: {
      controller: 'CountryController',
      method: 'getEntity',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    head: {
      controller: 'CountryController',
      method: 'getEntityHead',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    put: {
      controller: 'CountryController',
      method: 'update',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.UpdateLookup, constants.Scopes.AllLookup]
    },
    patch: {
      controller: 'CountryController',
      method: 'partiallyUpdate',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.UpdateLookup, constants.Scopes.AllLookup]
    },
    delete: {
      controller: 'CountryController',
      method: 'remove',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.DeleteLookup, constants.Scopes.AllLookup]
    }
  },

  '/lookups/educationalInstitutions': {
    get: {
      controller: 'EducationalInstitutionController',
      method: 'list',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    head: {
      controller: 'EducationalInstitutionController',
      method: 'listHead',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    post: {
      controller: 'EducationalInstitutionController',
      method: 'create',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.CreateLookup, constants.Scopes.AllLookup]
    }
  },
  '/lookups/educationalInstitutions/:id': {
    get: {
      controller: 'EducationalInstitutionController',
      method: 'getEntity',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    head: {
      controller: 'EducationalInstitutionController',
      method: 'getEntityHead',
      auth: 'jwt',
      // any role is allowed
      scopes: [constants.Scopes.ReadLookup, constants.Scopes.AllLookup]
    },
    put: {
      controller: 'EducationalInstitutionController',
      method: 'update',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.UpdateLookup, constants.Scopes.AllLookup]
    },
    patch: {
      controller: 'EducationalInstitutionController',
      method: 'partiallyUpdate',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.UpdateLookup, constants.Scopes.AllLookup]
    },
    delete: {
      controller: 'EducationalInstitutionController',
      method: 'remove',
      auth: 'jwt',
      access: [constants.UserRoles.Admin],
      scopes: [constants.Scopes.DeleteLookup, constants.Scopes.AllLookup]
    }
  },
  '/health': {
    get: {
      controller: 'HealthCheckController',
      method: 'check'
    }
  }
}
