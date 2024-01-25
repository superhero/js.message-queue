/**
 * @memberof MessageQueue.Schema.Entity
 * @typedef {Object} Message
 */
const schema =
{
  'rid':
  {
    'type'      : 'string',
    'not-empty' : true,
    'nullable'  : true,
    'default'   : null
  },
  'timestamp':
  {
    'type'      : 'timestamp',
    'json'      : true,
    'nullable'  : true,
    'default'   : null
  },
  'domain':
  {
    'type'      : 'string',
    'not-empty' : true
  },
  'pid':
  {
    'type'      : 'string',
    'not-empty' : true
  },
  'ppid':
  {
    'type'      : 'string',
    'not-empty' : true,
    'nullable'  : true,
    'default'   : null
  },
  'name':
  {
    'type'      : 'string',
    'not-empty' : true
  },
  'data':
  {
    'type'      : 'json',
    'default'   : {}
  }
}

module.exports = schema
