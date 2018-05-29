const formData = require('express-form-data')
const os = require('os')
const path = require('path')
const fs = require('fs')
const toArray = require('stream-to-array')

const mlab = require('mongolab-data-api')('40LUPN8uUT4iK3NUsTsoV--8dyUq28W-')

const options = {
    uploadDir: os.tmpdir(),
    autoClean: true,
}
const mlab_db_options = {
    database: 'heroku_5bw34zzz',
    collectionName: 'upload',
}

var addUpload = (rstream, filename) => {
    console.log('ready to upload data to mlab.mongodb...')
    toArray(rstream, (err, arr) => {
        console.log('toArray done.')
        console.log('err :')
        console.log(err)

        if (arr) {
            let db_options = {
                database: mlab_db_options.database,
                collectionName: mlab_db_options,
                documents: {
                    filename: filename,
                    data: arr,
                }
            }
            console.log('prepare to insert documents...')

            mlab.insertDocuments(db_options, (err) => {
                console.log('err :')
                console.log(err)
            })
        }
    })
}

var controller = {
    hello: (req, res) => {
        var data = { message: 'hello world' }
        return res.json(data)
    },

    upload: (req, res, next) => {

        console.log('upload called...')

        //console.log(req.files.file)

        let filename = path.basename(req.files.file.path)

        //let wstream = fs.createWriteStream(`${saveDir}\\${filename}`)

        //req.files.file.pipe(wstream)

        addUpload(req.files.file, filename)

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