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
const randomFile = "A" + Crypto.randomBytes(4).toString('hex') + 'data'
const gun = new Gun({
    axe:false,
    //multicast:false,
      //peers: ["http://localhost:8765/gun"]
    //peers: ["http://gun.shock.network:8765/gun"]
    //peers: ["http://127.0.0.1:8765/gun"],
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

let deadTimeout
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
    console.log("waiting encrypted")
    const random = Crypto.randomBytes(32).toString('hex')
    const randomInt =  parseInt(random,16)
    //sentSum += randomInt
    reqCount++
    latestSent = performance.now() 
    deadTimeout = setTimeout(()=>{
        gun.user(receiverPub).get(random).then(r => {
            console.log(`AM DEAD>${new Date()} existing data? : ${r}\n`)
        })
    },5000)
    user
    .get(receiverPub)
    .set(random)
    gun.user(receiverPub).get(random+"E").once(data => {
        if(!data){
            return
        }
        latestEncrypted = performance.now()
        otherEmitter.emit('gotEncrypted',{encrypted:data})
    })
    const otherEmitter = new EventEmitter()
    otherEmitter.on('gotEncrypted', ctx => {
        console.log("waiting epub")
        gun.user(receiverPub).get('epub').once(data => {
            latestEPub = performance.now()
            otherEmitter.emit('gotEPub',{receiverEPub:data,...ctx})
        })
    })
    otherEmitter.on('gotEPub', ctx => {
        console.log("waiting secret")
        const {receiverEPub} = ctx
        SEA.secret(receiverEPub,user._.sea)
        .then(data => {
            latestSecret = performance.now()
            otherEmitter.emit('gotSecret',{ourSecret:data,...ctx})
        })
    })
    
    otherEmitter.on('gotSecret',ctx => {
        console.log("waiting decrypted")
        const {encrypted,ourSecret} = ctx
        SEA.decrypt(encrypted, ourSecret)
        .then(payReq => {
            latestDecrypted = performance.now()
            otherEmitter.emit('decrypted')
        })
    })
    otherEmitter.on('decrypted',() => {
        console.log("done")
        otherEmitter.removeAllListeners()
        const perfNow = performance.now()
        const diff = perfNow - latestSent
        //confirmedSum += randomInt
        clearTimeout(deadTimeout)
        console.log(`SUM REPORT>${confirmedSum}:${sentSum}:${reqCount}:${perfNow - startTime}:${diff}:${latestEncrypted-latestSent}:${latestEPub-latestEncrypted}:${latestSecret-latestEPub}:${latestDecrypted-latestSecret}:${perfNow-latestDecrypted}`)
        if(diff >= Timeout){
            myEmitter.emit('sendReq')
        } else {
            setTimeout(() => {myEmitter.emit('sendReq')},Timeout - diff)
            
        }
    })
})




setTimeout(() => myEmitter.emit('retryCreate'),1000)