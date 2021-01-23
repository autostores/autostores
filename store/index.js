const STORE_RESERVED_KEYS = new Set([
  'createdActionMeta',
  'keyLastProcessed',
  'changeListeners',
  'keyLastChanged',
  'storeLoading',
  'logListeners',
  'changesBunch',
  'loguxClient',
  'isLoading'
])

module.exports = { STORE_RESERVED_KEYS }
