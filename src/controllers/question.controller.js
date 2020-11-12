const db = require("../models");
const Question = db.questions;
const User = db.users;
const Category = db.categories;
const Answer = db.answers;
const File = db.files;
const auth = require('basic-auth')
const { v4: uuidv4 } = require('uuid');
const joi = require('joi');
const bcrypt = require('bcrypt');
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const path = require('path');
require('dotenv').config();
const config = require("../config/db.config.js");
const logger = require('../config/logger');
const SDC = require('statsd-client');
const sdc = new SDC({host: config.METRICS_HOSTNAME, port: config.METRICS_PORT});



async function check (name, pass) {
    const start = Date.now()
    let result = await User.findOne({where: {username: name}});
    const end = Date.now()
    const elapsed = end - start;
    sdc.timing('timer.user.db.findOne', elapsed)
    if(!result) {
        logger.error("User not found!")
        return false;
    }

    result = await bcrypt.compare(pass,result.password);
    if(!result) {
        logger.error("Passwords do not match!")
        return false;
    }

    return true;
}

exports.create = async (req, res) => {
    logger.info("POST question api call....");
    sdc.increment('endpoint.question.http.post');
    const startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.question.http.create.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    } else {

        const arraySchema = joi.array().items(
            joi.object({
                category: joi.string()
            })
        );
        const schema = joi.object().keys({
            question_text: joi.string().required(),
            categories: arraySchema
        });

        let validation = schema.validate(req.body);
        if(validation.error) {
            logger.error(validation.error.details[0].message)
            sdc.timing('timer.question.http.create.error', Date.now() - startApi)
            return res.status(400).send({Error: validation.error.details[0].message});
        }

        let startDb = Date.now()
        let user = await User.findOne({where: {username: credentials.name}});
        sdc.timing('timer.user.db.findOne', Date.now() - startDb)

        let question = {
            question_id: uuidv4(),
            question_text: req.body.question_text,
        }
        startDb = Date.now()
        let questionCreated = await Question.create(question)
        await user.addQuestion(questionCreated)
        logger.info("Question created successfully")
        if(req.body.categories){
            let i = 0
            for(;i<req.body.categories.length;i++){
                let questionCategory = req.body.categories[i]
                let [categoryToAdd, created] = await Category.findOrCreate({where: {category: questionCategory.category.toLowerCase()},
                    defaults: {
                        category_id: uuidv4()
                    }
                })
                await questionCreated.addCategory(categoryToAdd)
            }
            logger.info("Categories created successfully")
        }
        sdc.timing('timer.question.db.create', Date.now() - startDb)


        startDb = Date.now()
        const result = await Question.findByPk(questionCreated.question_id,{
            include: [
                {
                    model: Category,
                    through: { attributes: [] }
                },
                {
                    as: 'answers',
                    model: Answer
                },
                {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }]
        })
        sdc.timing('timer.question.db.findByPk', Date.now() - startDb)

        sdc.timing('timer.question.http.create', Date.now() - startApi)
        return res.status(201).send(result);
    }
}

exports.getAllQuestions = async (req,res) => {
    logger.info("GET all questions api call....");
    sdc.increment('endpoint.question.http.getAll');
    const start = Date.now()
    const result = await Question.findAll({
        include: [
            {
                model: Category,
                through: { attributes: [] }
            },
            {
                as: 'answers',
                model: Answer,
                include : {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }
            },
            {
                as: 'attachments',
                model: File,
                attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
            }
        ]
    })
    sdc.timing('timer.question.db.getAll', Date.now() - start)
    sdc.timing('timer.question.http.getAll', Date.now() - start)
    res.status(200).send(result)
}

exports.getQuestion = async (req,res) => {
    logger.info("GET question by id api call....");
    sdc.increment('endpoint.question.http.getById');
    const start = Date.now()
    const result = await Question.findByPk(req.params.question_id,{
        include: [
            {
                model: Category,
                through: { attributes: [] }
            },
            {
                as: 'answers',
                model: Answer,
                include : {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }
            },
            {
                as: 'attachments',
                model: File,
                attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
            }
            ]
    })
    sdc.timing('timer.question.db.findByPk', Date.now() - start)
    if(!result) {
        logger.error("Question not found")
        sdc.timing('timer.question.http.getOne.error', Date.now() - start)
        return res.status(404).send({Error: "Question not found"})
    }

    sdc.timing('timer.question.http.getOne', Date.now() - start)
    res.status(200).send(result);
}

async function checkUserForQuestion(username, user_id){
    const start = Date.now()
    const user = await User.findOne({where: {username: username}});
    sdc.timing('timer.user.db.findOne', Date.now() - start)
    if(user.id === user_id)
        return true;

    return false;

}

exports.deleteQuestion = async (req,res) => {
    logger.info("DELETE question by api call....");
    sdc.increment('endpoint.question.http.delete');
    const startApi = Date.now()
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.question.http.delete.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }


    let startDb = Date.now()
    let question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)
    if(!question) {
        logger.error("Question not found")
        sdc.timing('timer.question.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question not found"})
    }

    let user = await checkUserForQuestion(credentials.name, question.user_id)

    if(!user) {
        logger.error("User unauthorized")
        sdc.timing('timer.question.http.delete.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorized"})
    }

    startDb = Date.now()
    let answers = await question.getAnswers();
    if(answers.length === 0){
        let files = await question.getAttachments();

        for(let i=0;i<files.length;i++){
            let startTemp = Date.now()
            await File.destroy({where: {file_id: files[i].file_id}})
            logger.info("File deleted from database!")
            sdc.timing('timer.question.file.db.delete', Date.now() - startTemp)

            let params = {
                Bucket: process.env.BUCKET_NAME,
                Key: files[i].s3_object_name
            }
            const startS3 = Date.now()
            s3.deleteObject(params, function(err, data) {
                if (err) {
                    logger.error("Problem deleting file in S3")
                    sdc.timing('timer.question.file.S3.delete.error', Date.now() - startS3)
                    console.log(err, err.stack);
                }  // error
                else {
                    logger.info("File successfully deleted from S3 bucket")
                    sdc.timing('timer.question.file.S3.delete', Date.now() - startS3)
                    return;
                }   // deleted
            });
        }
        await Question.destroy({ where: {question_id: question.question_id}})
        sdc.timing('timer.question.db.delete', Date.now() - startDb)

        logger.info("Question successfully deleted")
        sdc.timing('timer.question.http.delete', Date.now() - startApi)
        return res.status(204).send({"Message": "Successfully deleted"})
    }
    logger.error("The question has 1 or more answers")
    sdc.timing('timer.question.db.delete.error', Date.now() - startDb)
    sdc.timing('timer.question.http.delete', Date.now() - startApi)
    return res.status(400).send({Error: "The question has 1 or more answers."})

}

exports.updateQuestion = async (req, res) => {
    logger.info("PUT question by api call....");
    sdc.increment('endpoint.question.http.update');
    const startApi = Date.now()
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.question.http.update.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    let question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)
    if(!question) {
        logger.error("Question not found")
        sdc.timing('timer.question.http.update.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question not found"})
    }

    startDb = Date.now()
    let user = await User.findOne({where: {username: credentials.name}});
    sdc.timing('timer.user.db.findOne', Date.now() - startDb)
    if(user.id !== question.user_id) {
        logger.error("User unauthorized")
        sdc.timing('timer.question.http.update.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorized"})
    }

    const arraySchema = joi.array().items(
        joi.object({
            category: joi.string()
        })
    );
    const schema = joi.object().keys({
        question_text: joi.string(),
        categories: arraySchema
    });

    const { question_text, categories } = req.body;

    if(!question_text && !categories) {
        logger.error("No field supplied to update")
        sdc.timing('timer.question.http.update.error', Date.now() - startApi)
        return res.status(400).send({Error: "No field supplied to update"})
    }

    let validation = schema.validate(req.body);
    if(validation.error) {
        logger.error(validation.error.details[0].message)
        sdc.timing('timer.question.http.update.error', Date.now() - startApi)
        return res.status(400).send({Error: validation.error.details[0].message});
    }

    let updatedQuestion = {}

    if(question_text){
        updatedQuestion.question_text = question_text
    }

    startDb = Date.now()
    await Question.update(updatedQuestion, { where: { question_id: req.params.question_id}})

    let questionUpdated = await Question.findByPk(req.params.question_id)

    if(categories){
        await questionUpdated.setCategories([]);
        let i = 0
        for(;i<categories.length;i++){
            let questionCategory = categories[i]
            let [categoryToAdd, created] = await Category.findOrCreate({where: {category: questionCategory.category.toLowerCase()},
                defaults: {
                    category_id: uuidv4()
                }
            })

            await questionUpdated.addCategory(categoryToAdd)
        }

    }
    sdc.timing('timer.question.db.update', Date.now() - startDb)
    logger.info("Question updated successfully..")
    sdc.timing('timer.question.http.update', Date.now() - startApi)
    res.status(204).send({});

}


exports.attachFile = async (req, res) =>{
    logger.info("POST file to question by api call....");
    sdc.increment('endpoint.question.file.http.post');
    const startApi = Date.now()
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.question.file.http.post.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    let question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)
    if(!question) {
        logger.error("Question not found")
        sdc.timing('timer.question.file.http.post.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question not found"})
    }

    startDb = Date.now()
    let user = await User.findOne({where: {username: credentials.name}});
    sdc.timing('timer.user.db.findOne', Date.now() - startDb)

    if(user.id !== question.user_id) {
        logger.error("User unauthorized")
        sdc.timing('timer.question.file.http.post.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorized"})
    }


    const fileID = uuidv4();

    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.BUCKET_NAME,
            key: function (req, file, cb) {
                cb(null, req.params.question_id + "/" + fileID + "/" + path.basename( file.originalname, path.extname( file.originalname ) ) + path.extname( file.originalname ) )
            }
        }),
        limits:{ fileSize: 5000000 },
        fileFilter: function( req, file, cb ){
            checkFileType( file, cb );
        }
    })

    let startS3 = Date.now()
    const singleUpload = upload.single('image');
    await singleUpload(req, res, async (err) => {
        if(err) {
            logger.error("Uploaded file was not an image for question!!")
            sdc.timing('timer.question.file.http.post.error', Date.now() - startApi)
            return res.status(400).send({Error: 'Images only!'});
        }
        if(!req.file) {
            logger.error("No file uploaded for question!!")
            sdc.timing('timer.question.file.http.post.error', Date.now() - startApi)
            return res.status(400).send({Error: 'No File Uploaded'})
        }
        logger.info("File uploaded to S3")
        sdc.timing('timer.question.file.S3.post', Date.now() - startS3)

        const fileToAttach = {
            file_name: req.file.originalname,
            file_id: fileID,
            s3_object_name: req.file.key
        }
        let params = {
            Bucket: process.env.BUCKET_NAME,
            Key: fileToAttach.s3_object_name
        }

        const startMetadata = Date.now()
        const metadata = await s3.headObject(params).promise();
        sdc.timing('timer.question.file.S3.metadata.get', Date.now() - startMetadata)

        fileToAttach.LastModified = metadata.LastModified.toLocaleString()
        fileToAttach.ContentLength = metadata.ContentLength.valueOf()
        fileToAttach.ETag = metadata.ETag.valueOf()

        startDb = Date.now()
        const file = await File.create(fileToAttach);
        await question.addAttachment(file);
        sdc.timing('timer.question.file.db.create', Date.now() - startDb)
        logger.info("File attached successfully to question in database")
        sdc.timing('timer.question.file.http.post', Date.now() - startApi)
        return res.status(201).send(file);

    })

}

function checkFileType( file, cb ){

    const filetypes = /jpeg|jpg|png/;
    // Check ext
    const extname = filetypes.test( path.extname( file.originalname ).toLowerCase());
    // Check mime
    const mimetype = filetypes.test( file.mimetype );
    if( mimetype && extname ){
        return cb( null, true );
    } else {
        cb( 'Error' );
    }
}

exports.deleteFile = async (req, res) => {
    logger.info("DELETE file to question by api call....");
    sdc.increment('endpoint.question.file.http.delete');
    const startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.question.file.http.delete.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    const question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)
    if(!question) {
        logger.error("Question not found!!")
        sdc.timing('timer.question.file.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question Not found"})
    }

    startDb = Date.now()
    let user = await User.findOne({where: {username: credentials.name}});
    sdc.timing('timer.user.db.findOne', Date.now() - startDb)
    if(user.id !== question.user_id) {
        logger.error("User unauthorized!")
        sdc.timing('timer.question.file.http.delete.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorized"})
    }

    startDb = Date.now()
    let file = await question.getAttachments({ where: {file_id: req.params.file_id}})
    if(file.length === 0) {
        logger.error("File not found for given question")
        sdc.timing('timer.question.file.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "File not found for given question"})
    }

    file = file[0];

    await question.removeAttachment(file);

    await File.destroy({where: {file_id: req.params.file_id}})
    sdc.timing('timer.question.file.db.delete', Date.now() - startDb)
    logger.info("File destroyed from database!")

    let params = {
        Bucket: process.env.BUCKET_NAME,
        Key: file.s3_object_name
    }
    const startS3 = Date.now()
    s3.deleteObject(params, function(err, data) {
        if (err) {
            logger.error("Could not delete from S3 due to AWS Error")
            sdc.timing('timer.question.file.http.delete.error', Date.now() - startApi)
            console.log(err, err.stack);
        }  // error
        else {
            sdc.timing('timer.question.file.S3.delete', Date.now() - startS3)
            logger.info("File deleted from S3")
            sdc.timing('timer.question.file.http.delete', Date.now() - startApi)
            return res.status(204).send();
        }   // deleted
    });

}
