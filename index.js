const formData = require('express-form-data')
const os = require('os')
const path = require('path')
const fs = require('fs')
const toArray = require('stream-to-array')
const MongoClient = require('mongodb').MongoClient;
const multer = require('multer')
const _ = require('lodash')

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

//const _def_date = Date.parse('01 Jan 1970 00:00:00 GMT')
const _def_date = new Date(Date.UTC(2018, 06, 07))
let _save_queue = []
let _is_saving = false
let _is_scanning = false

var getUpload = (filename, callback) => {
    if (!mongo_db && !mongo_db.db_ready) {
        return callback(null, 'not ready')
    }

    var uploads = mongo_db.db.collection('uploads')
    uploads.find({ 'original_name': filename }).toArray(function(err, docs) {
        if (err) {
            callback(null, err)
        }

        callback(docs[0])
    })
}

var getUploadList = (callback, retry_times = 0) => {
    if (!mongo_db && !mongo_db.db_ready) {
        //return callback([], 'not ready')
        if (retry_times > 3) {
            return console.error('already retry over 3 times to connect to mlab, but still fail !!')
        }
        return connectToMongoDb(() => { getUploadList(callback, ++retry_times) })
    }

    var uploads = mongo_db.db.collection('uploads')
    uploads.find({}).toArray(function(err, docs) {
        if (err) {
            callback([], err)
        }

        _.each(docs, (doc, index) => {
            
            if (true || !doc.createdate) {
                doc.createdate = _def_date

                updateDocument(uploads, doc)
            }
        })


        callback(docs)
    })
}

var updateDocument = (collection, doc) => {
    collection.updateOne({ 'original_name': doc.original_name }, { $set: doc }, function(err, result) {
        if (err) {
            console.log(`saveDoc [${doc.original_name}] to mongodb error !`)
            console.log(err)
        }
    })
}

var saveDocument = (data) => {
    _save_queue.push(data)
}

var saveDocumentScan = () => {
    _is_scanning = true

    if (!mongo_db && !mongo_db.db_ready) {
        performNextScan()
        return
    }

    if (_is_saving) {
        performNextScan()
        return
    }

    //console.log('saveDocumentScan...')

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
                    items: [ { _last_access: 0, name: data.original_name, create_date: data.createdate } ]
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
                doc.items.push({ _last_access: 0, name: data.original_name, create_date: data.createdate })
                _.each(doc.items, (item) => {
                    if (item.create_date) {
                        return
                    }

                    item.create_date = _def_date
                })

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

var checkScanning = function() {
    _is_scanning = false


    setTimeout(function() {
        if (_is_scanning) {
            console.log('saveDocument scan is running...')
        }
        else {
            console.log('saveDocument scan stopped !')
        }

        checkScanning()
    }, 60 * 1000)
}

var connectToMongoDb = (url, callback) => {
    // Use connect method to connect to the server
    MongoClient.connect(url, function(err, client) {
        if (err) {
            console.log(err)
            return
        }

        console.log("Connected successfully to mlab.");
    
        global.mongo_db = {
            db_ready: true,
            db: client.db(dbName)
        }
    
        if (callback) {
            callback()
        }
        //client.close();
        global.performNextScan = function() {
            setTimeout(saveDocumentScan, 500)
        }
    });
}

var controller = {
    hello: (req, res) => {
        // var data = { message: 'hello world' }
        // return res.json(data)

        getUploadList(function(uploads, error) {
            if (error) {
                return res.json(error)
            }

            res.render('index', {
                title: 'This is EJS template test',
                uploads: _.orderBy(uploads, [ 'createdate', 'original_name' ], [ 'desc', 'asc' ])
            })
        })
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
            createdate: new Date(),
        })

        res.sendStatus(200)
    },

    data: (req, res) => {
        var filename = req.params.file;

        getUpload(filename, function(upload, error) {
            if (error) {
                res.sendStatus(400)
                res.json(error)
                return
            }

            // for debug use
            //console.log(upload)

            if (req.query.download == "1") {
                var contentDisposition = `attachment; filename="${upload.original_name}"`
                res.set('Content-Disposition', contentDisposition)
            }
            res.set('Content-Type', upload.mimetpe)
            res.set('Content-Length', upload.size)
            res.set('data-id', upload._id)

            //res.end(upload.buffer, 'binary')
            //res.send(200, new Buffer(upload.buffer))
            res.status(200).send(new Buffer(upload.buffer.buffer))
        })
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

    connectToMongoDb(() => {
        saveDocumentScan()

        checkScanning()
    })
    console.log(`static : ${path.join(__dirname, 'assets')}`)
    app.set('view engine', 'ejs');
    app.use(express.static(path.join(__dirname, 'assets')))

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())
    // app.use(formData.parse(options))
    // app.use(formData.format())
    // app.use(formData.stream())
    // app.use(formData.union())

    initRoute(app)

    server.listen(port)

    console.log(`escape-server-web listen on : ${port}`)
    console.log(`tmp dir : ${os.tmpdir()}`)
    console.log('timezone :')
    console.log(new Date().getTimezoneOffset())
}

init()