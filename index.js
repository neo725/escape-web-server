const formData = require('express-form-data')
const os = require('os')
const path = require('path')
const fs = require('fs')
const toArray = require('stream-to-array')
const MongoClient = require('mongodb').MongoClient;
const multer  = require('multer')

// var storage = multer.memoryStorage()
// var m_upload = multer({ storage: storage })

var uploadService = multer({ storage: multer.memoryStorage() });

const db_user = 'eweb_user'
const db_password = 'QWERT27005858'

// Connection URL
const url = `mongodb://${db_user}:${db_password}@ds139920.mlab.com:39920/heroku_5bw34zzz`
 
// Database Name
const dbName = 'heroku_5bw34zzz';

const options = {
    uploadDir: os.tmpdir(),
    autoClean: true,
}
//const saveDir = "G:\\#Temp"

let _save_queue = []
let _is_saving = false

var saveDocument = (data) => {
    _save_queue.push(data)
}

var saveDocumentScan = () => {
    if (!mongo_db && !mongo_db.db_ready) {
        performNextScan()
        return
    }

    if (_is_saving) {
        performNextScan()
        return
    }

    console.log('saveDocumentScan...')

    if (_save_queue.length == 0) {
        performNextScan()
        return
    }

    var getInfo = function (data, callback, error_callback) {
        var info = mongo_db.db.collection('info')

        info.find({ 'name': 'uploads' }).toArray(function(err, docs){
            console.log(docs)

            var doc = {}
            if (docs.length == 0) {
                var doc = {
                    name: 'uploads',
                    count: 1,
                    items: [ { _last_access: 0, name: data.original_name } ]
                }

                info.insert(doc, function(err, result) {
                    if (err) {
                        console.log('saveInfo to mongodb error !')
                        console.log(err)
    
                        return error_callback()
                    }
    
                    callback(data)
                })
            }
            else {
                doc = docs[0]
                doc.count += 1
                doc.items.push({ _last_access: 0, name: data.original_name })

                info.updateOne({ 'name': 'uploads' }, { $set: doc }, function(err, result) {
                    if (err) {
                        console.log('saveInfo to mongodb error !')
                        console.log(err)
    
                        return error_callback()
                    }

                    callback(data)
                })
            }
        })
    }

    if (_is_saving == false && _save_queue.length > 0) {
        _is_saving = true

        data = _save_queue.pop()

        getInfo(data, function(data) {
            var uploads = mongo_db.db.collection('uploads')
    
            uploads.insert(data, function(err, result) {
                if (err) {
                    console.log('saveDocument to mongodb error !')
                    console.log(err)
                }
        
                console.log('save data result is :')
                console.log(result)

                _is_saving = false

                performNextScan()
            })
        }, function() {
            performNextScan()
            _is_saving = false
        })
    }
}

// Use connect method to connect to the server
MongoClient.connect(url, function(err, client) {
    if (err) {
        console.log(err)
        return
    }

    console.log("Connected successfully to server");
   
    global.mongo_db = {
        db_ready: true,
        db: client.db(dbName)
    }
   
    //client.close();
    global.performNextScan = function() {
        setTimeout(saveDocumentScan, 500)
    }

    saveDocumentScan()
});

var controller = {
    hello: (req, res) => {
        var data = { message: 'hello world' }
        return res.json(data)
    },

    upload: (req, res, next) => {

        console.log('upload called...')

        if (req.files) {
            console.log(req.files)
        }

        if (req.files == undefined || req.files.length == 0 || req.files[0].size == 0) {
            console.log('req.files is undefined or not an array or files.size = 0.')

            res.sendStatus(200)
            return
        }

        let file = req.files[0]

        var Binary = require('mongodb').Binary;

        saveDocument({
            original_name: file.originalname,
            mimetpe: file.mimetype,
            buffer: Binary(file.buffer),
            size: file.size,
        })

        res.sendStatus(200)
    },

    data: (req, res) => {
        res.sendStatus(200)
    }
}
var initRoute = (app) => {
    // app.route('/')
    //     .get(controller.hello)
    // app.route('/upload')
    //     .post(upload.array(), controller.upload)
    // app.route('/data/:file')
    //     .get(controller.data)
    app.get('/', controller.hello)
    app.post('/upload', uploadService.array('file'), controller.upload)
    app.get('/data/:file', controller.data)
}
var init = () => {
    var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    port = process.env.PORT || 3000,
    bodyParser = require('body-parser')

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    // app.use(formData.parse(options))
    // app.use(formData.format())
    // app.use(formData.stream())
    // app.use(formData.union())

    initRoute(app)

    server.listen(port)

    console.log(`escape-server-web listen on : ${port}`)

}

init()