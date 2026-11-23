/** Aviso operativo del descubrimiento (S4): se imprime, se guarda y se reporta. */
export interface DiscoveryWarning {
  code: string
  message: string
}

/**
 * Sin `MAL_CLIENT_ID` el descubrimiento de anime nuevos no corre: sus tareas
 * quedan `skipped` (re-armables). Antes eso pasaba en silencio.
 */
export const discoveryWarnings = (
  malClientId: string | undefined
): DiscoveryWarning[] =>
  malClientId
    ? []
    : [
        {
          code: 'missing:MAL_CLIENT_ID',
          message:
            'MAL_CLIENT_ID no está definido: malDiscovery NO descubre anime nuevos; ' +
            'sus tareas quedan skipped (missing:MAL_CLIENT_ID) hasta configurarlo',
        },
      ]
