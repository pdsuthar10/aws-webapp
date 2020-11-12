// require('dotenv-flow').config();
require('dotenv').config();

module.exports = {
    HOST: process.env.HOST,
    USER: process.env.USERNAME,
    PASSWORD: process.env.PASSWORD,
    DB: process.env.DB,
    dialect: "mysql",
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    METRICS_HOSTNAME:'localhost',
    METRICS_PORT: 8125
};