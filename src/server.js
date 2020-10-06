const app = require('./app');

const db = require("./models");
// db.sequelize.sync();

db.sequelize.sync({force: false});

// set port, listen for requests
// const PORT = process.env.PORT || 8080;
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});