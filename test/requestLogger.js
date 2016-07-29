var assert = require('chai').assert
var memoryStream = require('memorystream')

/*
 * Generate a Mock httpServer Request and Response
 * @PARAM statusCode - a RFC2616 status code
 * @PARAM forwarded - A boolean on whether or not to use the x-forwarded-for header, as if behind an ELB
 * @PARAM ip - The ip to insert into the request
 * @PARAM url - the url/path
 */
function generateMockRequestAndResponse (statusCode, forwarded, ip, url) {
  var req = {
    connection: {
      remoteAddress: ip || '8.8.8.8'
    },
    headers: {
      'referer': 'http://google.com',
      'user-agent': 'Mozilla/5.0 (Windows NT x.y; WOW64; rv:10.0) Gecko/20100101 Firefox/10.0'
    },
    httpVersion: '1.1',
    method: 'GET',
    url: url || '/test',
    path: url || '/test'
  }
  if (forwarded) {
    req.connection.remoteAddress = '8.8.4.4'
    req.headers['x-forwarded-for'] = ip || '8.8.8.8'
  }
  var res = {
    end: function () { return true; },
    statusCode: statusCode || 200
  }
  return {res: res, req: req, next: function () { res.end(); }}
}

describe('Request Logger', function () {
  // our logger is a singleton, but we need a clean instance
  delete require.cache[require.resolve('./../dadi/index.js')]
  var logger = require('./../dadi/index.js')
  var memstream = new memoryStream() // save ourselves from the fs rabbit hole

  logger.init({
    accessLog: {
      enabled: true
    },
    enabled: true,
    filename: 'test',
    level: 'trace',
    path: 'log/',
    testStream: [{level: 'trace', stream: memstream}]
  }, null, 'test')

  it('should log a request', function (done) {
    var testHttp = generateMockRequestAndResponse()
    var chunks = 0
    memstream.on('data', function (chunk) {
      var output = JSON.parse(chunk.toString())
      chunks++
      if (output.name === 'dadi.test') {
        assert(output.msg.indexOf('GET /test') !== -1, 'contains method and path')
        assert(output.msg.indexOf('200') !== -1, 'contains status')
      }else if (output.name === 'access') {
        assert(output.msg.indexOf('8.8.8.8') !== -1, 'contains IP address')
        assert(output.msg.indexOf('http://google.com') !== -1, 'contains referer')
        assert(output.msg.indexOf('GET /test') !== -1, 'contains method and path')
        assert(output.msg.indexOf('Mozilla/5.0') !== -1, 'contains user agent')
      }
      if (chunks >= 2) {
        memstream.removeAllListeners('data')
        return done() // only finish after accesslog and info
      }
    })
    logger.requestLogger(testHttp.req, testHttp.res, testHttp.next) // fire
  })

  it('should keep a count of requests', function () {
    assert(logger.stats.requests === 1, 'correct amount of requests logged')
  })

  it('should handle x-forwarded-for correctly', function (done) {
    var chunks = 0
    var testHttp = generateMockRequestAndResponse(200, true)
    memstream.on('data', function (chunk) {
      var output = JSON.parse(chunk.toString())
      chunks++
      if (output.name === 'dadi.test') {
        assert(output.msg.indexOf('GET /test') !== -1, 'contains method and path')
        assert(output.msg.indexOf('200') !== -1, 'contains status')
      }else if (output.name === 'access') {
        assert(output.msg.indexOf('8.8.8.8') !== -1, 'contains IP address')
        assert(output.msg.indexOf('http://google.com') !== -1, 'contains referer')
        assert(output.msg.indexOf('GET /test') !== -1, 'contains method and path')
        assert(output.msg.indexOf('Mozilla/5.0') !== -1, 'contains user agent')
      }
      if (chunks >= 2) return done() // only finish after accesslog and info
    })
    logger.requestLogger(testHttp.req, testHttp.res, testHttp.next) // fire
  })
})