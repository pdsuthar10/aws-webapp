module.exports = (sequelize, Sequelize) => {
    const Answer = sequelize.define("answer",{
        answer_id : {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false
        },
        answer_text: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        timestamps: true,
        createdAt: "created_timestamp",
        updatedAt: "updated_timestamp"
    });



    return Answer

}