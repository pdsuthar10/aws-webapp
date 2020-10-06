module.exports = (sequelize, Sequelize) => {
    const Category = sequelize.define("category",{
        category_id : {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false
        },
        category: {
            type: Sequelize.STRING,
            allowNull: false
        }
    },{
        timestamps: false
    });

    return Category;
}