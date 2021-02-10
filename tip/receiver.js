const Gun = require('gun')
const Crypto = require('crypto')
const SEA = require('gun/sea')
const fs = require('fs')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
require('gun/lib/open')
require('gun/lib/load')
const nodeID = process.argv[2] || 'SomeCommonNodeIDKForRealYO'
const lndAddr = process.argv[3]
const macaroonHex = process.argv[4]
const tlsHex = process.argv[5]
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
const packageDefinition = protoLoader.loadSync('tip/rpc.proto', loaderOptions);
const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc;
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';
const lndCert = Buffer.from(tlsHex,'hex')
const sslCreds = grpc.credentials.createSsl(lndCert);
const macaroonCreds = grpc.credentials.createFromMetadataGenerator(function(args, callback) {
  let metadata = new grpc.Metadata();
  metadata.add('macaroon', macaroonHex);
  callback(null, metadata);
});
let creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);
const  lightning = new lnrpc.Lightning(lndAddr, creds);
const randomFile = "A" + Crypto.randomBytes(4).toString('hex') + 'data'
//INIT GUN
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
const context = {}
const requests = {}
const call = lightning.subscribeInvoices({});
call.on('data', function(response) {
    // A response was received from the server.
    if(response.settled){
        const rH = response.r_hash.toString('hex')
        const cb = requests[rH]
        if(cb){
            cb()
        }
    }
});
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
            console.log(`USER PUB>${user._.sea.pub}>`)
            myEmitter.emit('retryMySecret')
        }
    })
})

myEmitter.on('retryMySecret', () => {
    SEA.secret(user._.sea.epub, user._.sea)
    .then(secret => {
        context.mySecret = secret
        myEmitter.emit('ready')
    })
    .catch(e => myEmitter.emit('retryMySecret'))
})
const registered = {}
myEmitter.on('ready',() => {
    const {myPub,mySecret} = context
    gun.get(nodeID).open(up => {
        Object.values(up).forEach(e => {
            if(!registered[e]){
                registered[e] = true
                subscribeToSender(e,myPub,mySecret)
            }
        })
    })
})

const processedRandoms = {}
const subscribeToSender = (pub,myPub,secret) => {
    gun.user(pub).get(myPub).open(obj => {
        Object.values(obj).forEach(random => {
            if(!processedRandoms[random]){
                processedRandoms[random] = true
                startOperation(pub,random)
            }
        })
    })
}
const startOperation = (otherPub,random) => {
    const operationEmitter = new EventEmitter()
    const localContext = {}
    localContext.random = random
    const invoiceReq = {
        expiry: 36000,
        value: 10,
        private: true
    }
    lightning.addInvoice(invoiceReq, function(err, response) {
        if(!err){
            localContext.invoice = response
            operationEmitter.emit('invoiceReady')
        }else {console.log(err)}
    });
    operationEmitter.on('invoiceReady',() => {
        gun.user(otherPub).get('epub').once(data => {
            localContext.otherEPub = data
            operationEmitter.emit('ePubReady')
        })
    })
    operationEmitter.on('ePubReady',() => {
        SEA.secret(
            localContext.otherEPub,
            user._.sea
        ).then(ourSecret => {
            localContext.ourSecret = ourSecret
            operationEmitter.emit('secretReady')
        })
    })
    operationEmitter.on('secretReady', () => {
        const {invoice,ourSecret} = localContext
        SEA.encrypt(invoice.payment_request,ourSecret)
        .then(encrypted => {
            localContext.encrypted = encrypted
            operationEmitter.emit('encryptedReady')
        })
    })
    operationEmitter.on('encryptedReady',() => {
        const {encrypted,invoice,random} = localContext
        user.get(random+"E").put(encrypted)
        requests[invoice.r_hash.toString('hex')] = () => operationEmitter.emit('invoicePaid')
    })
    operationEmitter.on('invoicePaid', () => {
        const {random} = localContext
        user.get(random).put("ok")
        operationEmitter.removeAllListeners()
    })
}
setTimeout(() => myEmitter.emit('retryCreate'),1000)