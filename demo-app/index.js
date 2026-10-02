import express from 'express'
import os from 'os'

const app = express()
const PORT = process.env.PORT || 3000

const delay = (s) => new Promise(resolve => setTimeout(resolve, s*1000));

app.get('/', (req, res) => res.send('Home\n'));

app.get('/delay', (req, res) => {
    setTimeout(() => {
        res.send(`Delay finished. Worker: ${process.env.HOSTNAME}\n`);
    }, 3000);
});

app.get('/heavy', (req, res) => {
    let sum = 0;
    for (let i = 0; i < 50000000; i++) {
        sum += i;
    }
    res.send(`Heavy computation complete. Worker ID: ${process.env.HOSTNAME}\n`);
});

app.listen(PORT, ()=> {
    console.log(`server listening at port ${PORT}`)
})

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Stopping new traffic and draining active requests...');
    
    server.close(() => {
        console.log('All active requests finished successfully. Shutting down.');
        process.exit(0);
    });
});