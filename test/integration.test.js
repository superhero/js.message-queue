const expect  = require('chai').expect

describe('Message queue test suit', () =>
{
  let core

  before((done) =>
  {
    const
      CoreFactory = require('superhero/core/factory'),
      coreFactory = new CoreFactory

    core = coreFactory.create()

    core.add('client', __dirname + '/../src/client')
    core.add('test', __dirname)

    core.load(true)

    core.locate('core/bootstrap').bootstrap().then(done).catch((error) => core.locate('core/console').log(error))
  })

  after(async () =>
  {
    await core.locate('message-queue/client').quit()
  })

  const
    timestamp = new Date().toJSON(),
    ppid      = 'test-' + Date.now().toString(32),
    pid       = 'test-' + Date.now().toString(36),
    domain    = 'test-domain' + Date.now().toString(36),
    name      = 'test-event'  + Date.now().toString(36),
    data      = { test:pid },
    event     = { timestamp, domain, ppid, pid, name, data }

  it('consume when a domain event was persisted', function (done)
  {
    const client = core.locate('message-queue/client')
    let i = 0
    client.consume(domain, name, (dto) =>
    {
      expect(dto.pid).to.equal(pid)
      ++i === 2 && done()
    }).then(() => client.write(event) && client.write(event))
  })

  it('read the message log', async function ()
  {
    const
      schema      = core.locate('core/schema/composer'),
      client      = core.locate('message-queue/client'),
      messageLog  = await client.readMessageLog(domain, pid)

    expect(messageLog.length).to.deep.equal(2)
    expect(schema.compose.bind(schema, 'message-queue/schema/entity/message', messageLog[0])).to.not.throw()
    expect(schema.compose.bind(schema, 'message-queue/schema/entity/message', messageLog[1])).to.not.throw()
  })

  it('read if a process has a persisted event', async function ()
  {
    const
      client      = core.locate('message-queue/client'),
      messageLog  = await client.readMessageLog(domain, pid),
      hasEvent    = await client.hasMessage(messageLog, name)

    expect(hasEvent).to.equal(true)
  })

  it('can schedule an event to be persisted in the future', function (done)
  {
    const
      client        = core.locate('message-queue/client'),
      scheduledPid  = pid   + '-scheduled',
      scheduledName = name  + '-scheduled',
      timestamp     = Date.now() + 500
    
    client.consume(domain, scheduledName, (dto) =>
    {
      expect(dto.pid).to.equal(scheduledPid)
      expect(dto.name).to.equal(scheduledName)
      expect(dto.data).to.deep.equal(data)
      done()
    }).then(() => client.schedule(timestamp, { domain, pid:scheduledPid, name:scheduledName, data }))
  })
})
