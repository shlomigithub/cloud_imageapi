var restify = require('restify');
var redisClient = require('redis').createClient;
var redis = redisClient(6379, 'localhost');
var mongojs = require("mongojs");
var AWS = require('aws-sdk');
var fsService = require('fs');
// var color = require('dominant-color');
var ce = require('colour-extractor');

AWS.config.loadFromPath('./AWSConfig.json');

var s3Service = new AWS.S3();

/**
 * file system service 
 */

var multiparty = require('connect-multiparty');
var multipartMiddleware = multiparty();

var server = restify.createServer();
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(restify.CORS());

// db connect
var connection_string = 'mongodb://localhost:27017/app';
var db = mongojs(connection_string, ['app']);

db.on('error', function (err) {
  console.log('database error', err);
});

var images = db.collection("images");


var API_PATH = '/images';
server.get({path : API_PATH+'/get' , version : '0.0.1'} , list);
server.get({path : API_PATH +'/get/:id' , version : '0.0.1'} , findImage);
server.post({path : API_PATH+'/upload' , version: '0.0.1'} , upload);
server.get({path : API_PATH+'/add' , version: '0.0.1'} , displayAddForm);
server.post({path : API_PATH +'/update/:id' , version: '0.0.1'} , update);
server.del({path : API_PATH +'/delete/:id' , version: '0.0.1'} ,del);
server.put({path : API_PATH +'/meta/:id' , version: '0.0.1'} ,postImageMetadata);

function upload(req, res, next) {

  console.log("upload new image request "+ new Date());

  var file = req.files.file;

 

  res.setHeader('Access-Control-Allow-Origin','*');

  var color = "#000000";
  ce.topColours(file.path, true, function (colours) {
    color = ce.rgb2hex( colours[0][1] );    
    images.save({name:file.name, color: color }, function(err, img) {
      if (err) {
        console.log('error '+err);
        res.send(300, err);
      } else {
        var key = img._id.toString();
        uploadFile(key, file.path, file.type);
        res.send(201 , img);
        //displayAddForm(req, res, next);
      }
    });
  });
}

function displayAddForm(req, res, next){
  
  fsService.readFile('upload.html',function (err, data){
        res.writeHead(200, {'Content-Type': 'text/html','Content-Length':data.length});
        res.write(data);
        res.end();
    });
}

function update(req, res, next) {
  
    console.log("update request for "+req.params.id+" "+ new Date());
    var file = req.files.file;
    var key = req.params.id;
    images.findOne({_id: mongojs.ObjectId(key)}, function (error,success){
          if(success){
              uploadFile(key, file.path, file.type);
              res.send(200 , success);
              return next();
          }else{
              res.send(404, {message: "not found"});
              return next(err);
          }
    });
}

function del(req, res, next) {
  
  console.log("image removed");
    res.setHeader('Access-Control-Allow-Origin','*');
    images.remove({_id:mongojs.ObjectId(req.params.id)} , function(err , success){
        
        if(success){
            res.send(204);
            return next();
        } else{
            return next(err);
        }
    });
}

function list(req, res, next) {
  console.log("list images request");
    res.setHeader('Access-Control-Allow-Origin','*');
     images.find().sort({postedOn : -1} , function(err , success){
        if(success){
            res.send(200 , success);
            return next();
        }else{
            return next(err);
        }
    });
}

function findImage(req, res, next) {
  
  console.log("find images request");
    res.setHeader('Access-Control-Allow-Origin','*');
    var id = req.params.id;
    redis.get(id, function (err, success) {
        if (err) callback(null);
        else if (success) //Image exists in cache
            res.send(200 , success);
        else {
            // Image doesn't exists in cache - need to query mongo
            images.findOne({_id:mongojs.ObjectId(id)} , function(err , success) {
                
                if(success){
                    redis.set(id, JSON.stringify(success), function () {
                        res.send(200 , success);
                        return next();
                    });
                } else {
                    res.send(404, {message: "not found"});
                    return next(err);
                }
            });
        }
    });
}

function postImageMetadata(req, res , next) {
  
    console.log("post meta request for  "+req.params.id+" "+ new Date());
    var id = req.params.id;
    var img = {};
    img.title = req.params.title;
    img.creator = req.params.creator;
    res.setHeader('Access-Control-Allow-Origin','*');
  
    images.update({_id:mongojs.ObjectId(id)},
                  {$set:img}, function(err, success) {
        if(success) {
                  console.log(img._id);
            res.send(201 , 'ok');
            return next();
        } else {
            res.send(404, {message: "not found"});
            return next(err);
        }
    });
}

function uploadFile(remoteFilename, fileName, contentType) {
 
  var fileStream = fsService.createReadStream(fileName);
  fileStream.on('error', function (err) {
    if (err) { 
      console.log(err);
      throw err; 
      }
  });  
  
  fileStream.on('open', function () {
      s3Service.upload({
        ACL: 'public-read',
      Bucket: 'shenkar-shlomi-imageapi',
      Key: 'images/'+remoteFilename,
      Body: fileStream,
      ContentType: contentType,
    }, function(error, response) {
      console.log('uploaded file[' + fileName + '] to [' + remoteFilename + '] as [' + contentType + ']');
      console.log(arguments);
    });
  });
}

server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});

