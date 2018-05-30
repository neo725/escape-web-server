const formData = require('express-form-data')
const os = require('os')
const path = require('path')
const fs = require('fs')

const options = {
    uploadDir: os.tmpdir(),
    autoClean: true,
}
const saveDir = "G:\\#Temp"

var controller = {
    hello: (req, res) => {
        var data = { message: 'hello world' }
        return res.json(data)
    },

    upload: (req, res, next) => {

        console.log('upload called...')

        //console.log(req.files.file)

        let filename = path.basename(req.files.file.path)

        // let wstream = fs.createWriteStream(`${saveDir}\\${filename}`)

        // req.files.file.pipe(wstream)

        //console.log(req.body)

        return res.sendStatus(200)
    }
}
var initRoute = (app) => {
    app.route('/')
        .get(controller.hello)
    app.route('/upload')
        .post(controller.upload)
}
var init = () => {
    var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    port = process.env.PORT || 3000,
    bodyParser = require('body-parser')

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    app.use(formData.parse(options))
    app.use(formData.format())
    app.use(formData.stream())
    app.use(formData.union())

    initRoute(app)

    server.listen(port)

    console.log(`escape-server-web listen on : ${port}`)

}

init()