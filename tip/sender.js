const Gun = require('gun')
const Crypto = require('crypto')
const SEA = require('gun/sea')
const fs = require('fs')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
require('gun/lib/open')
require('gun/lib/load')
const { performance } = require('perf_hooks')
const [_,__,nodeID,receiverPub,timeout] = process.argv
const lndAddr = process.argv[5]
const macaroonHex = process.argv[6]
const tlsHex = process.argv[7]
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
// INIT LND
const loaderOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};
const packageDefinition = protoLoader.loadSync(['tip/rpc.proto', 'tip/router.proto'], loaderOptions);
const routerrpc = grpc.loadPackageDefinition(packageDefinition).routerrpc;
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';
const lndCert = Buffer.from(tlsHex,'hex')
const sslCreds = grpc.credentials.createSsl(lndCert);
const macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(args, callback) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', macaroonHex);
  callback(null, metadata);
});
let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);
const  router = new routerrpc.Router(lndAddr, creds);
const randomFile = "A" + Crypto.randomBytes(4).toString('hex') + 'data'
const gun = new Gun({
    axe:false,
    multicast:false,
      //peers: ["http://localhost:8765/gun"]
    //peers: ["http://gun.shock.network:8765/gun"]
    peers: ["http://127.0.0.1:8765/gun"],
    //peers: ['http://gun.shock.network:8765/gun','http://gun2.shock.network:8765/gun'],
      //peers: ["http://167.88.11.206:8765/gun"]
      //peers: ["http://guntest.herokuapp.com/gun"]
    file:randomFile
})
const Timeout = parseInt(timeout,10)

const context = {}
const user = gun.user()
myEmitter.on('retryCreate', () => {
    const alias = Crypto.randomBytes(8).toString('hex')
    const pass = Crypto.randomBytes(8).toString('hex')
    user.create(alias, pass, ackC => {
        if(ackC.err) {
            myEmitter.emit('retryCreate')
        } else {
            context.alias = alias
            context.pass = pass
            myEmitter.emit('retryAuth')
        }
    })
})
myEmitter.on('retryAuth', () => {
    const {alias,pass} = context
    user.auth(alias, pass, ackA => {
        if(ackA.err){
            setTimeout(() => {
                user.leave()
                myEmitter.emit('retryAuth')
            })
        } else {
            context.myPub = user._.sea.pub
            myEmitter.emit('retryMySecret')
        }
    })
})
let startTime
let latestSent 
let latestEncrypted
let latestEPub
let latestSecret
let latestDecrypted
let sentSum = 0
let confirmedSum = 0 
let reqCount = 0
myEmitter.on('retryMySecret', () => {
    SEA.secret(user._.sea.epub, user._.sea)
    .then(secret => {
        context.mySecret = secret
        gun.get(nodeID).set(context.myPub)
        setTimeout(() => {
            myEmitter.emit('sendReq')
            startTime = performance.now()
        },1000)
    })
    .catch(e => myEmitter.emit('retryMySecret'))
})


myEmitter.on('sendReq', () => {
    const random = Crypto.randomBytes(6).toString('hex')
    const randomInt =  parseInt(random,16)
    sentSum += randomInt
    reqCount++
    latestSent = performance.now()
    user
    .get(receiverPub)
    .set(random)
    gun.user(receiverPub).get(random+"E").on(data => {
        if(!data){
            return
        }
        latestEncrypted = performance.now()
        myEmitter.emit('gotEncrypted',{encrypted:data})
    })
    gun.user(receiverPub).get(random).on(data => {
        if(!data){
            return
        }
        const perfNow = performance.now()
        const diff = perfNow - latestSent
        confirmedSum += randomInt
        console.log(`SUM REPORT>${confirmedSum}:${sentSum}:${reqCount}:${perfNow - startTime}:${diff}:${latestEncrypted-latestSent}:${latestEPub-latestEncrypted}:${latestSecret-latestEPub}:${latestDecrypted-latestSecret}:${perfNow-latestDecrypted}`)
        if(diff >= Timeout){
            myEmitter.emit('sendReq')
        } else {
            setTimeout(() => {myEmitter.emit('sendReq')},Timeout - diff)
            
        }
    })
})

myEmitter.on('gotEncrypted', ctx => {
    gun.user(receiverPub).get('epub').once(data => {
        latestEPub = performance.now()
        myEmitter.emit('gotEPub',{receiverEPub:data,...ctx})
    })
})
myEmitter.on('gotEPub', ctx => {
    const {receiverEPub} = ctx
    SEA.secret(receiverEPub,user._.sea)
    .then(data => {
        latestSecret = performance.now()
        myEmitter.emit('gotSecret',{ourSecret:data,...ctx})
    })
})

myEmitter.on('gotSecret',ctx => {
    const {encrypted,ourSecret} = ctx
    SEA.decrypt(encrypted, ourSecret)
    .then(payReq => {
        latestDecrypted = performance.now()
        myEmitter.emit('decrypted',payReq)
    })
})
myEmitter.on('decrypted',payReq => {
    const request = {
        payment_request: payReq,
        max_parts: 3,
        timeout_seconds:6,
        no_inflight_updates:true,
        fee_limit_sat:10,
    }
    const call = router.sendPaymentV2(request);
})

setTimeout(() => myEmitter.emit('retryCreate'),1000)