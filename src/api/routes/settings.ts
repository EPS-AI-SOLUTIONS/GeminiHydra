/**
 * Settings Routes
 * Settings management endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import { settingsStore } from '../stores/index.js';
import { validateSettingsUpdate } from '../validators/index.js';
import type { Settings } from '../types/index.js';
import type { SettingsPatchRequest } from '../types/fastify.js';

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/settings
   * Get current settings
   */
  fastify.get<{ Reply: Settings }>('/settings', async () => {
    return settingsStore.get();
  });

  /**
   * PATCH /api/settings
   * Update settings
   */
  fastify.patch<SettingsPatchRequest & { Reply: Settings | { error: string } }>(
    '/settings',
    async (request, reply) => {
      const validated = validateSettingsUpdate(request.body);
      const result = settingsStore.update(validated);

      if ('error' in result) {
        reply.status(400);
        return result;
      }

      return result;
    }
  );

  /**
   * POST /api/settings/reset
   * Reset settings to defaults
   */
  fastify.post<{ Reply: Settings }>('/settings/reset', async () => {
    return settingsStore.reset();
  });
};
