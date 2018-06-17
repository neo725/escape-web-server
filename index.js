const formData = require('express-form-data')
const os = require('os')
const path = require('path')
const fs = require('fs')
const toArray = require('stream-to-array')
const MongoClient = require('mongodb').MongoClient;
const multer = require('multer')
const moment = require('moment')
const _ = require('lodash')
const colors = require('colors')
const rimraf = require('rimraf')
const archiver = require('archiver')

// var storage = multer.memoryStorage()
// var m_upload = multer({ storage: storage })

var uploadService = multer({ storage: multer.memoryStorage() });

const db_user = 'eweb_user'
const db_password = 'QWERT27005858'

// Connection URL
const db_url = `mongodb://${db_user}:${db_password}@ds139920.mlab.com:39920/heroku_5bw34zzz`
 
// Database Name
const dbName = 'heroku_5bw34zzz';

const options = {
    uploadDir: os.tmpdir(),
    autoClean: true,
}

//const _def_date = Date.parse('07 Jun 1981 00:00:00 GMT')
let _def_date = new Date(Date.UTC(2018, 6, 7))
let _save_queue = []
let _is_saving = false
let _is_scanning = false

_def_date.setMonth(_def_date.getMonth() - 1)


var findIndex = (list, find) => {
    var currentIndex = -1
    var findIndex = -1

    list.forEach(function(item) {
        currentIndex += 1
        
        if (typeof(item) == 'string') {

            if (item == find) {
                findIndex = currentIndex
            }
        }

        else if (typeof(item) == 'object') {
            if (item.hasOwnProperty('name') && 
                item.name == find) {
                    findIndex = currentIndex
                }
            else if (typeof(find) == 'function') {
                if (find(item) == true) {
                    findIndex = currentIndex
                }
            }
        }
    })

    return findIndex
}

var compressList = (list, generationZip = false, callback) => {

    var zipPath = ''
    var sections = []

    //const regex = /(\w+)_.+/gi;
    const regex = /([0-9A-Z]+)/gi

    list.forEach((upload) => {
        var create_date = moment(upload.createdate)
        var name = upload.original_name
        var size = upload.size
        var section_name = create_date.format('YYYY-M-D')
        var section_path = path.join(options.uploadDir, section_name)

        console.log(`section_path = ${section_path}`.yellow)

        var index = findIndex(sections, section_name)
        if (index == -1) {
            sections.push({
                name: section_name,
                count: 1
            })

            index = sections.length - 1

            if (fs.existsSync(section_path)) {
                rimraf.sync(section_path)
            }
            fs.mkdirSync(section_path)
        }
        else {
            sections[index].count += 1
        }
        
        var section = sections[index]
        
        var match = name.match(regex)
        var part = '', indexOfParts = -1, part_path = ''
        if (match && match != null) {
            part = match[0]

            if (!section.parts || section.parts === undefined) {
                section.parts = [part]
                section.parts_summary = [{ part_name: part, count: 0}]
            }
            else {
                indexOfParts = findIndex(section.parts, part)
                if (indexOfParts == -1 && part && part.length > 0) {
                    section.parts.push(part)
                    section.parts_summary.push({ part_name: part, count: 0})
                }
            }

            part_path = path.join(section_path, part)

            var findFunc = (item) => {
                return item.part_name == part
            }

            var summaryIndex = findIndex(section.parts_summary, findFunc)
            if (summaryIndex != -1) {
                var summary = section.parts_summary[summaryIndex]

                if (summary) {
                    summary.count += 1
                }
            }

            if (fs.existsSync(part_path) == false) {
                fs.mkdirSync(part_path)
            }

            console.log(`part_path = ${part_path}`)

            //var buffer = new Buffer(upload.buffer, 'binary')
            var buffer = Buffer.from(upload.buffer, 'binary')
            var file_name = path.join(part_path, name)
            if (name == '4FJ8UG_A.png') {
                throw `name : ${name}, size: ${upload.size}, length : ${buffer.byteLength}`
            }

            fs.writeFileSync(file_name, buffer, "binary")
            var _start = moment()
            while (true) {
                var _now = moment()
                if (_now.diff(_start, 'seconds') == 10) {
                    var err = `Error while processing file : ${file_name} !`
                    err += '\r\n'
                    err += `exists : ${fs.existsSync(file_name)}` + '\r\n'
                    err += `size : ${fs.statSync(file_name).size}` + '\r\n'
                    err += `actural size should be : ${size}`
                    throw err
                    break;
                }
                if (fs.existsSync(file_name)) {
                    var stat = fs.statSync(file_name)
                    if (stat.size == size) {
                        break;
                    }
                }
            }
        }
        
    })
    
    sections.forEach(function(section) {
        var section_path = path.join(options.uploadDir, section.name)

        section.parts.forEach(function(part) {
            var findExpr = function (item) {
                return item.part_name == part
            }

            var partIndex = findIndex(section.parts_summary, findExpr)
            if (partIndex != -1) {
                var summary = section.parts_summary[partIndex]
                var count = summary.count
                var part_path = path.join(section_path, part)
                fs.renameSync(part_path, `${part_path} (${summary.count})`)
            }
        })

        if (!generationZip) return;

        var zip_path = `${section_path}.zip`

        if (fs.existsSync(zip_path)) {
            fs.unlinkSync(zip_path)
        }

        var output = fs.createWriteStream(zip_path)
        // var archive = archiver('zip', {
        //     zlib: { level: 9 }
        // })
        var archive = archiver('zip')

        output.on('close', function() {
            console.log(archive.pointer() + ' total bytes')
            console.log('archiver has been finalized and the output file descriptor has closed.')

            if (callback) {
                callback(zip_path)
            }
        })

        archive.on('error', function(error) {
            console.log('Error on zip folder...')
            console.log(error)
        })

        archive.pipe(output)

        archive.directory(section_path, section.name)

        archive.finalize()

        zipPath = zip_path
    })

    return { sections: sections, zipPath: zipPath }
}

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

        var retry_fn = () => {
            getUploadList(callback, ++retry_times)
        }

        return connectToMongoDb(db_url, retry_fn)
    }

    var uploads = mongo_db.db.collection('uploads')
    uploads.find({}).toArray(function(err, docs) {
        if (err) {
            callback([], err)
        }

        _.each(docs, (doc, index) => {
            
            if (!doc.createdate) {

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
                doc = {
                    name: 'uploads',
                    count: 1,
                    items: [ { _last_access: 0, 
                        name: data.original_name, 
                        create_date: data.createdate } ]
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

var fixInfo = function (callback) {
    var info = mongo_db.db.collection('info')

    info.find({ 'name': 'uploads' }).toArray((err, docs) => {
        var doc = docs[0]

        _.each(doc.items, (item) => {
            if (item.create_date) {
                return
            }

            item.create_date = _def_date
        })

        info.updateOne({ 'name': 'uploads' }, { $set: doc }, function(err, result) {
            if (err) {
                console.log('Info fix in mongodb error !')
                console.log(err)
            }

            console.log('Info fix done !')
            if (callback) {
                callback()
            }
        })
    })
}

var fixUploads = function (callback) {
    var uploadsCollection = mongo_db.db.collection('uploads')
    uploadsCollection.find({}).toArray((err, uploads) => {
        _.each(uploads, (upload) => {
            if (upload.createdate) {
                var createdate = moment(upload.createdate)

                upload.section = createdate.format('YYYY-M-D')

                uploadsCollection.updateOne({ 'original_name': upload.original_name }, 
                    { $set: upload }, function (err, result) {
                        if (err) {
                            console.log('Uploads fix in mongodb error !')
                            console.log(err)
                        }
                    })
            }
        })

        if (callback) {
            callback()
        }
    })
}

var init_db_scan = () => {
    saveDocumentScan()

    checkScanning()
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
    
        //client.close();
        global.performNextScan = function() {
            setTimeout(saveDocumentScan, 500)
        }

        if (callback) {
            callback()
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

    compressDownloadList: (req, res) => {
        var getUploadCompressList = (uploads, error) => {
            if (error) {
                return res.json(error)
            }

            var ordered_uploads = _.orderBy(uploads, [ 'section', 'createdate', 'original_name' ], [ 'desc', 'desc', 'asc' ])

            var result = compressList(ordered_uploads)

            res.render('compress-list', {
                title: '打包下載',
                sections: result.sections
            })
        }

        getUploadList(getUploadCompressList)
    },

    downloadZip: (req, res) => {
        var section_name = req.params.section_name;
        var uploadsCollection = mongo_db.db.collection('uploads')

        uploadsCollection.find({ 'section': section_name }).toArray((err, uploads) => {
            if (uploads && uploads.length == 0) {
                res.status(303).send(`${section_name} has no uploads`)
                return
            }

            var section_path = path.join(options.uploadDir, section_name)

            console.log(`section_path = ${section_path}`.yellow)

            if (fs.existsSync(section_path)) {
                rimraf.sync(section_path)
            }
            fs.mkdirSync(section_path)
            
            var callback = (zip_path) => {
                if (zip_path && fs.existsSync(zip_path)) {
                    console.log(`zip file : ${zip_path}`.bgRed.white)

                    res.sendFile(zip_path, (error) => {
                        if (error) {
                            res.status(error.status).end()
                        }
                    })
                }
            }

            compressList(uploads, true, callback)
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
            section: moment().format('YYYY-M-D'),
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
    },

    fixInfo: (req, res) => {
        fixInfo(() => {
            res.status(200)
        })
    },

    fixUploads: (req, res) => {
        fixUploads(() => {
            res.status(200)
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
    app.get('/all', controller.hello)
    app.post('/upload', uploadService.array('file'), controller.upload)
    app.get('/data/:file', controller.data)
    app.get('/fix-info', controller.fixInfo)
    app.get('/fix-uploads', controller.fixUploads)
    app.get('/', controller.compressDownloadList)
    app.get('/compress/:section_name', controller.downloadZip)
}
var init = () => {
    var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    port = process.env.PORT || 3000,
    bodyParser = require('body-parser')

    connectToMongoDb(db_url, init_db_scan)
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
    console.log(`_def_date : ${_def_date}`)
}

init()