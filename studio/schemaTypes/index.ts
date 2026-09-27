import {decision, review} from './audit'
import {category, supplyItem} from './catalog'
import {certificate, pledge, proof, receiptScan} from './fulfillment'
import {need} from './need'
import {
  flagQuestion,
  needItem,
  policyThresholds,
  proofMatch,
  receiptLine,
  triageFlag,
  triageSummary,
} from './objects'
import {policy} from './policy'

export const schemaTypes = [
  // Documents
  need,
  pledge,
  proof,
  receiptScan,
  certificate,
  decision,
  review,
  category,
  supplyItem,
  policy,
  // Objects
  needItem,
  triageFlag,
  triageSummary,
  receiptLine,
  proofMatch,
  flagQuestion,
  policyThresholds,
]
