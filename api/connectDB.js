const mongoose = require('mongoose');

// const mongoUri = "mongodb://localhost:27017/acm";

// const connectToMongo = () => {
//     mongoose.connect(mongoUri , ()=>{
//         console.log("Connect To Mongo Successfully");
//     })
// } 

// module.exports = connectToMongo;

const DB_URI = "mongodb://0.0.0.0:27017/chat";

const connectDatabase = () => {
    mongoose.connect(DB_URI, {

        useNewUrlParser: true, 
        
        useUnifiedTopology: true 
        
        }, err => {
        if(err) throw err;
        console.log('Connected to MongoDB!!!')
        });
};

module.exports = connectDatabase;