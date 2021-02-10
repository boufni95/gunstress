const Gun = require('gun')
const Crypto = require('crypto')
const SEA = require('gun/sea')
const fs = require('fs')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
require('gun/lib/open')
require('gun/lib/load')
const { performance } = require('perf_hooks')
const gun = new Gun({
    axe:false,
    //multicast:false,
    //peers: ["http://127.0.0.1:8765/gun"],
})
const [_,__,nodeID,receiverPub,timeout] = process.argv
console.log(nodeID)
console.log(receiverPub)
console.log(timeout)
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
let StartTime
myEmitter.on('retryMySecret', () => {
    SEA.secret(user._.sea.epub, user._.sea)
    .then(secret => {
        context.mySecret = secret
        gun.get(nodeID).set(context.myPub)
        setTimeout(() => {
            myEmitter.emit('sendReq')
            StartTime = performance.now()
        },1000)
    })
    .catch(e => myEmitter.emit('retryMySecret'))
})
let latestSent 
let sentSum = 0
let confirmedSum = 0 
let reqCount = 0

myEmitter.on('sendReq', () => {
    const random = Crypto.randomBytes(6).toString('hex')
    const randomInt =  parseInt(random,16)
    sentSum += randomInt
    reqCount++
    latestSent = performance.now()
    user
    .get(receiverPub)
    .set(random)

    gun.user(receiverPub).get(random).on(data => {
        if(!data){
            return
        }
        console.log(`got res to ${random}`)
        console.log(data)
        const diff = performance.now() - latestSent
        if(diff >= Timeout){
            console.log('operation took longer than timeout')
            confirmedSum += randomInt
            console.log(`SUM REPORT>${confirmedSum}:${sentSum}:${reqCount}:${performance.now() - StartTime}>`)
            myEmitter.emit('sendReq')
        } else {
            setTimeout(() => {myEmitter.emit('sendReq')},Timeout - diff)
            console.log('got response will retry in '+(Timeout - diff))
            confirmedSum += randomInt
            console.log(`SUM REPORT>${confirmedSum}:${sentSum}:${reqCount}:${performance.now() - StartTime}>`)
        }
    })
})

setTimeout(() => myEmitter.emit('retryCreate'),1000)