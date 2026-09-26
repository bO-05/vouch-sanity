import {isJevConfigured} from '@/lib/jev'
import {client} from '@/lib/sanity/client'
import {dataset, projectId} from '@/lib/sanity/config'
import {isWriteClientConfigured} from '@/lib/sanity/write-client'
import {STATUS_COUNTS_QUERY, type StatusCounts} from '@/lib/queries'
import {isVerifierConfigured} from '@/lib/verifier'

/**
 * Public health/status: what this deployment can reach and which server secrets are set.
 * Reports booleans only, never secret values.
 */
export async function GET() {
  const configured = {
    sanityWriteToken: isWriteClientConfigured(),
    typesafeApiKey: isJevConfigured(),
    verifierPasscode: isVerifierConfigured(),
  }
  try {
    const counts = await client.withConfig({useCdn: false}).fetch<StatusCounts>(STATUS_COUNTS_QUERY)
    return Response.json({ok: true, sanity: {projectId, dataset, ...counts}, configured})
  } catch (error) {
    return Response.json(
      {
        ok: false,
        sanity: {projectId, dataset, error: error instanceof Error ? error.message : 'Unknown error'},
        configured,
      },
      {status: 502},
    )
  }
}
