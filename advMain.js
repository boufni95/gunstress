const { spawn } = require("child_process");
const { performance } = require('perf_hooks')
const Crypto = require('crypto')
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
const n =2
const randomNode = Crypto.randomBytes(10).toString('hex')
const context = {}
const fs = require('fs')
const lndArgs = [
    [
        '127.0.0.1:10001',
        fs.readFileSync('C:\\Users\\_\\.polar\\networks\\2\\volumes\\lnd\\alice\\data\\chain\\bitcoin\\regtest\\admin.macaroon').toString('hex'),
        fs.readFileSync('C:\\Users\\_\\.polar\\networks\\2\\volumes\\lnd\\alice\\tls.cert').toString('hex')
    ],
    [
        '127.0.0.1:10002',
        fs.readFileSync('C:\\Users\\_\\.polar\\networks\\2\\volumes\\lnd\\bob\\data\\chain\\bitcoin\\regtest\\admin.macaroon').toString('hex'),
        fs.readFileSync('C:\\Users\\_\\.polar\\networks\\2\\volumes\\lnd\\bob\\tls.cert').toString('hex')
    ],
]
const ps = spawn("node", ["basic/receiver",randomNode,...lndArgs[0]]);

ps.stdout.on("data", data => {
    //console.log(`stdout: ${data}`);
    const dataS = data.toString()
    if(dataS.startsWith('USER PUB>')){
        const pub = dataS.split('>')[1]
        context.pub = pub
        myEmitter.emit('pubReady')
    }
});

ps.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
});

ps.on('error', (error) => {
    console.log(`error: ${error.message}`);
});

ps.on("close", code => {
    console.log(`child process exited with code ${code}`);
});

myEmitter.on('pubReady',() => {
    for( let i = 0; i< n ; i++){
        RunSender(i)
    }
})
const responses = Array(n)
const dead = Array(n)
let encryptSum = 0
let ePubSum = 0
let secretSum = 0
let decryptSum = 0
let resSum = 0
let diffSum = 0
let tot = 0
const printRes = () => {
    console.clear()
    for(let i = 0; i< responses.length;i++){
        let deadS = ''
        if(dead[i]){
            `DEAD last req:${Math.round((performance.now() - dead[i])/1000)} seconds ago `
        }
        const data = responses[i] || [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        const [confirmedSum,sentSum,reqCount,runningTime,tDiff,tEncrypt,tEPub,tSecret,tDecrypt,tRes] = data
        console.log(`${i+1}:${deadS} ${confirmedSum}/${sentSum} diff:${confirmedSum - sentSum} n sent: ${reqCount}  running:${Math.round(runningTime/1000)} seconds `)
        encryptSum += parseInt(tEncrypt,10)
        ePubSum += parseInt(tEPub,10)
        secretSum += parseInt(tSecret,10)
        decryptSum += parseInt(tDecrypt,10)
        resSum += parseInt(tRes,10)
        diffSum += parseInt(tDiff,10)
        tot++
    }
    const percent = (n1,n2) => {
        return ((n1/n2) * 100).toFixed(2)
    }
    const avgEncrypt = encryptSum / tot
    const avgEPub = ePubSum / tot
    const avgSecret = secretSum / tot
    const avgDecrypt = decryptSum / tot
    const avgRes = resSum / tot
    const avgDiff = diffSum / tot
    const output = 'times im milliseconds\n'+
    `avg time for operation:${avgDiff.toFixed(2)}\n`+
    `avg time spent waiting invoice:${avgEncrypt.toFixed(2)}, aka ${percent(avgEncrypt,avgDiff)}%\n`+
    `avg time spent waiting epub:${avgEPub.toFixed(2)}, aka ${percent(avgEPub,avgDiff)}%\n`+
    `avg time spent waiting outSecret:${avgSecret.toFixed(2)}, aka ${percent(avgSecret,avgDiff)}%\n`+
    `avg time spent decrypting:${avgDecrypt.toFixed(2)}, aka ${percent(avgDecrypt,avgDiff)}%\n`+
    `avg time spent waiting ack:${avgRes.toFixed(2)}, aka ${percent(avgRes,avgDiff)}%`
    console.log(output)
}
const RunSender = (index) => {
    const {pub} = context
    console.log(pub)
    const ps = spawn("node", ["basic/sender",randomNode,pub,"1",...lndArgs[1]]);

    ps.stdout.on("data", data => {
        const dataS = data.toString()
        //console.log(`stdout ${index}: ${data}`);
        //return
        dataS.split('\n').forEach(line => {
            if(line.startsWith('SUM REPORT>')){
                const report = line.split('>')[1]
                responses[index] = report.split(':')
                //console.log(responses[index])
                printRes()
    
            } else if(line.startsWith('AM DEAD>')){
                const report = line.split('>')[1]
                dead[index] = report
                //console.log(responses[index])
                printRes()
            }
        })
    });
    
    ps.stderr.on("data", data => {
        console.log(`stderr ${index}: ${data}`);
    });
    
    ps.on('error', (error) => {
        console.log(`error ${index}: ${error.message}`);
    });
    
    ps.on("close", code => {
        console.log(`child process ${index} exited with code ${code}`);
    });

}

