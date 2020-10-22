const dbConfig = require('../config/db.config');

const Sequelize = require('sequelize');
const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
    host: dbConfig.HOST,
    dialect: dbConfig.dialect,
    operatorsAliases: 0,

    pool: {
        max: dbConfig.pool.max,
        min: dbConfig.pool.min,
        acquire: dbConfig.pool.acquire,
        idle: dbConfig.pool.idle
    }
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.users = require("./user.model")(sequelize, Sequelize);
db.answers = require("./answer.model")(sequelize,Sequelize);
db.categories = require("./category.model")(sequelize,Sequelize);
db.questions = require("./question.model")(sequelize, Sequelize);
db.files = require("./file.model")(sequelize, Sequelize);

const User = db.users;
const Answer = db.answers;
const Category = db.categories;
const Question = db.questions;
const File = db.files;

User.hasMany(Question,{
    as: 'questions',
    foreignKey:{
        name: 'user_id'
    }
})

User.hasMany(Answer, {
    as: 'answer',
    foreignKey: {
        name: 'user_id'
    }
})

db.categories.belongsToMany(db.questions, {through: 'QuestionsCategory'})
db.questions.belongsToMany(db.categories, {through: 'QuestionsCategory'})

db.questions.hasMany(db.answers, {
    as: 'answers',
    foreignKey: {
        name : "question_id",
        type: Sequelize.UUID
    }
})

Question.hasMany(File, {
    as: 'attachments',
    foreignKey: {
        name: 'question_id'
    }
})

Answer.hasMany(File, {
    as: 'attachments',
    foreignKey: {
        name: 'answer_id'
    }
})

module.exports = db;