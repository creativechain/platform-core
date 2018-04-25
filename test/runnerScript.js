

process.on('SIGTERM', function () {
    console.log('SIGTERM')
    process.kill(process.pid, 'SIGKILL')
});

process.on('message', (data) => {
    console.log('Process', data);
});

for (let x = 0; x < 10; x++) {
    process.send({ event: 'variable', response: [x]});
}