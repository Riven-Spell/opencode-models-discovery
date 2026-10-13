import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { ToastNotifier } from '../ui/toast-notifier'
import { createConfigHook } from './config-hook'
import { createEventHook } from './event-hook'
import { createPluginLogger } from './logger'
import { createLegacyGlobalConfigWarningController } from './legacy-config-warning'
import { parsePluginConfig, type PluginConfig } from '../types/plugin-config'

export const ModelDiscoveryPlugin: Plugin = async (input: PluginInput, options?: PluginOptions) => {
  const { client } = input
  const logger = createPluginLogger(client, { category: 'plugin' })

  if (!client || typeof client !== 'object') {
    logger.error('Invalid client provided to plugin')
    return {
      config: async () => { },
      event: async () => { },
    }
  }

  logger.info('Model discovery plugin initialized')
  logger.info('Running through the OpenCode v1 legacy adapter; OpenCode v2 is the primary supported integration.', {
    adapter: 'v1-legacy',
    supportPolicy: 'legacy',
  })

  const pluginConfig: PluginConfig = parsePluginConfig(options || {})

  if (pluginConfig.discovery?.enabled === false) {
    logger.info('Discovery disabled by configuration', { category: 'config' })
  }

  const toastNotifier = new ToastNotifier(client)
  const legacyGlobalConfigWarning = createLegacyGlobalConfigWarningController()

  return {
    config: createConfigHook(client, toastNotifier, pluginConfig, legacyGlobalConfigWarning, logger.child({ category: 'config' })),
    event: createEventHook(toastNotifier, legacyGlobalConfigWarning, logger.child({ category: 'event' })),
  }
}

//export const LMStudioPlugin = ModelDiscoveryPlugin
