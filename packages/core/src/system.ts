import type express from 'express'
import next from 'next'
import {
  type IdFieldConfig,
  type KeystoneConfig,
  type KeystoneContext
} from './types'
import { createAdminUIMiddlewareWithNextApp } from './lib/createAdminUIMiddleware'
import {
  idFieldType
} from './lib/id-field'

/** @deprecated, TODO: remove in breaking change */
export { createSystem } from './lib/createSystem'

/** @deprecated, TODO: remove in breaking change */
export { createExpressServer } from './lib/createExpressServer'

function injectDefaults (config: KeystoneConfig, defaultIdField: IdFieldConfig) {
  // some error checking
  for (const [listKey, list] of Object.entries(config.lists)) {
    if (list.fields.id) {
      throw new Error(`"fields.id" is reserved by Keystone, use "db.idField" for the "${listKey}" list`)
    }

    if (list.isSingleton && list.db?.idField) {
      throw new Error(`"db.idField" on the "${listKey}" list conflicts with singleton defaults`)
    }
  }

  const updated: KeystoneConfig['lists'] = {}

  for (const [listKey, list] of Object.entries(config.lists)) {
    if (list.isSingleton) {
      updated[listKey] = {
        ...list,
        fields: {
          id: idFieldType({ kind: 'number', type: 'Int' }),
          ...list.fields,
        },
        hooks: {
          ...list.hooks
        }
      }

      continue
    }

    updated[listKey] = {
      ...list,
      fields: {
        id: idFieldType(list.db?.idField ?? defaultIdField),
        ...list.fields,
      },
      hooks: {
        ...list.hooks
      }
    }
  }

  /** @deprecated, TODO: remove in breaking change */
  for (const [listKey, list] of Object.entries(updated)) {
    if (list.hooks === undefined) continue
    if (list.hooks.validate !== undefined) {
      if (list.hooks.validateInput !== undefined) throw new TypeError(`"hooks.validate" conflicts with "hooks.validateInput" for the "${listKey}" list`)
      if (list.hooks.validateDelete !== undefined) throw new TypeError(`"hooks.validate" conflicts with "hooks.validateDelete" for the "${listKey}" list`)
      continue
    }

    list.hooks.validate = {}
    if (typeof list.hooks.validateInput === 'function') {
      list.hooks.validate.create = list.hooks.validateInput
      list.hooks.validate.update = list.hooks.validateInput
    }
    if (typeof list.hooks.validateDelete === 'function') {
      list.hooks.validate.delete = list.hooks.validateDelete
    }
  }

  return updated
}

function defaultIsAccessAllowed ({ session, sessionStrategy }: KeystoneContext) {
  if (!sessionStrategy) return true
  return session !== undefined
}

/** @deprecated, TODO: remove in breaking change */
export function initConfig (config: KeystoneConfig): KeystoneConfig {
  return resolveDefaults(config)
}

function resolveDefaults (config: KeystoneConfig) {
  if (!['postgresql', 'sqlite', 'mysql'].includes(config.db.provider)) {
    throw new TypeError(`"db.provider" only supports "sqlite", "postgresql" or "mysql"`)
  }

  // WARNING: Typescript should prevent this, but any string is useful for Prisma errors
  config.db.url ??= 'postgres://'

  const defaultIdField = config.db.idField ?? { kind: 'cuid' }
  const cors =
    config.server?.cors === true
      ? { origin: true, credentials: true }
      : config.server?.cors ?? false

  return {
    ...config,
    types: {
      path: 'node_modules/.keystone/types.ts',
      ...config.types,
    },
    db: {
      shadowDatabaseUrl: '', // TODO: is this ok
      extendPrismaSchema: (schema: string) => schema,
      prismaClientPath: '@prisma/client',
      prismaSchemaPath: 'schema.prisma',
      ...config.db,
      idField: defaultIdField,
    },
    graphql: {
      path: '/api/graphql',
      playground: process.env.NODE_ENV !== 'production',
      schemaPath: 'schema.graphql',
      ...config.graphql,
    },
    lists: injectDefaults(config, defaultIdField),
    server: {
      maxFileSize: 200 * 1024 * 1024, // 200 MiB
      extendExpressApp: async () => {},
      extendHttpServer: async () => {},
      ...config.server,
      cors,
    },
    // TODO: remove in breaking change, move to .graphql.extendSchema
    extendGraphqlSchema: config.extendGraphqlSchema ?? ((s) => s),
    storage: {
      ...config?.storage
    },
    telemetry: config?.telemetry ?? true,
    ui: {
      isAccessAllowed: defaultIsAccessAllowed,
      pageMiddleware: async () => {},
      publicPages: [],
      basePath: '',
      ...config?.ui,
    },
  } satisfies KeystoneConfig
}

/** @deprecated, TODO: remove in breaking change */
export async function createAdminUIMiddleware (
  config: KeystoneConfig,
  context: KeystoneContext,
  dev: boolean,
  projectAdminPath: string
  // TODO: return type required by pnpm
): Promise<(req: express.Request, res: express.Response) => void> {
  const nextApp = next({ dev, dir: projectAdminPath })
  await nextApp.prepare()
  return createAdminUIMiddlewareWithNextApp(config, context, nextApp)
}
