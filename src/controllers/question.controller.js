const db = require("../models");
const Question = db.questions;
const Op = db.Sequelize.Op;
const User = db.users;
const { v4: uuidv4 } = require('uuid');
const Category = db.categories;
const auth = require('basic-auth')
const joi = require('joi');
const bcrypt = require('bcrypt');

async function check (name, pass) {
    let result = await User.findOne({where: {email_address: name}});
    if(!result) return false;

    result = await bcrypt.compare(pass,result.password);
    if(!result) return false;

    return true;
}

exports.create = async (req, res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
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
        if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

        if(!req.body.categories) return res.status(400).send({Error: "No categories supplied"});

        let categoryList = await Category.findAll();
        let user = await User.findOne({where: {email_address: credentials.name}});

        let question = {
            question_id: uuidv4(),
            question_text: req.body.question_text,
        }
        let result = await Question.create(question)
        if(!result) return res.status(500).send({Error: "Internal Error"});

        await user.addQuestion(result)

        let i = 0
        for(;i<req.body.categories.length;i++){
            let questionCategory = req.body.categories[i]
            let store = {
                category_id: uuidv4(),
                category: questionCategory.category
            }
            if(!categoryList.includes(questionCategory.category)){
                let categoryAdded = await Category.create(store)
                await result.addCategory(categoryAdded);
                await categoryAdded.addQuestion(result)
            }
            else{
                let categoryToAdd = await Category.findOne({where: {category: questionCategory.category}})
                await result.addCategory(categoryToAdd);
                await categoryToAdd.addQuestion(result)
            }
        }

        return res.status(201).send(result);

    }
}
