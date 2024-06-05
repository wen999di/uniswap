import { InterfaceEventName, WalletConnectionResult } from '@uniswap/analytics-events'
import { useAccountDrawer } from 'components/AccountDrawer/MiniPortfolio/hooks'
import { PropsWithChildren, createContext, useContext, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { getCurrentPageFromLocation } from 'utils/urlRoutes'
import { UserRejectedRequestError } from 'viem'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { ResolvedRegister, UseConnectReturnType, useConnect as useConnectWagmi, useDisconnect } from 'wagmi'

const ConnectionContext = createContext<UseConnectReturnType<ResolvedRegister['config']> | undefined>(undefined)

export function ConnectionProvider({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const accountDrawer = useAccountDrawer()
  const { disconnect } = useDisconnect()

  const connection = useConnectWagmi({
    mutation: {
      onMutate({ connector }) {
        console.debug(`Connection activating: ${connector.name}`)
      },
      onSuccess(_, { connector }) {
        console.debug(`Connection activated: ${connector.name}`)
        accountDrawer.close()
      },
      onError(error, { connector }) {
        if (error instanceof UserRejectedRequestError) {
          connection.reset()
          return
        }

        // TODO(WEB-1859): re-add special treatment for already-pending injected errors & move debug to after didUserReject() check
        console.debug(`Connection failed: ${connector.name}`)
        console.error(error)

        sendAnalyticsEvent(InterfaceEventName.WALLET_CONNECTED, {
          result: WalletConnectionResult.FAILED,
          wallet_type: connector.name,
          page: getCurrentPageFromLocation(pathname),
          error: error.message,
        })
      },
    },
  })

  useEffect(() => {
    if (!accountDrawer.isOpen && connection.isPending) {
      connection.reset()
      disconnect()
    }
  }, [connection, accountDrawer.isOpen, disconnect])

  return <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>
}

/**
 * Wraps wagmi.useConnect in a singleton provider to provide the same connect state to all callers.
 * @see {@link https://wagmi.sh/react/api/hooks/useConnect}
 */
export function useConnect() {
  const value = useContext(ConnectionContext)
  if (!value) {
    throw new Error('useConnect must be used within a ConnectionProvider')
  }
  return value
}
