const connectToMongo = require('./connectDB')
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const Message = require('./models/Message');
const ws = require('ws');
const fs = require('fs');
const bodyParser = require("body-parser");
const cloudinary = require("cloudinary");
const fileUpload = require("express-fileupload");


dotenv.config();
connectToMongo();


// mongoose.connect("process.env.MONGO_URL", () => {
//   console.log("Connected to MongoDB");
// });

// mongoose.connect("mongodb+srv://khandelwalpratham8743:1KTNZs9xWVbTvuaT@cluster0.ayeowqi.mongodb.net/")
//   .then(() => {
//       console.log("Connected to database");
//   })
//   .catch((error) => {
//       console.error("Error connecting to database:", error);
//   });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})



const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

const app = express();
// app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(express.json());
app.use(cookieParser());

const corsOptions = {
    origin:'http://localhost:5173', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
  } 
 
app.use(cors(corsOptions));

  
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());

async function getUserDataFromRequest(req) {
  return new Promise((resolve, reject) => {
    const token = req.cookies?.token;
    if (token) {
      jwt.verify(token, jwtSecret, {}, (err, userData) => {
        if (err) throw err;
        resolve(userData);
      });
    } else {
      reject('no token');
    }
  });

}
  
  app.get('/api/test', (req,res) => {
    res.json('test ok');
  });
  
  app.get('/api/messages/:userId', async (req,res) => {
    const {userId} = req.params;
    const userData = await getUserDataFromRequest(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
      sender:{$in:[userId,ourUserId]},
      recipient:{$in:[userId,ourUserId]},
    }).sort({createdAt: 1});
    res.json(messages);
  });
  
  app.get('/api/people', async (req,res) => {
    const users = await User.find({}, {'_id':1,username:1});
    res.json(users);
  });
  
  app.get('/api/profile', (req,res) => {
    const token = req.cookies?.token;
    if (token) {
      jwt.verify(token, jwtSecret, {}, (err, userData) => {
        if (err) throw err;
        res.json(userData);
      });
    } else {
      res.status(401).json('no token');
    }
  });
  
  app.post('/api/login', async (req,res) => {
    // console.log("USERNAME");
    const {username, password} = req.body;
    console.log("Password", password);
    const foundUser = await User.findOne({username});
    console.log("Password", foundUser);
    if (!password || !foundUser.password) {
      console.log("password", foundUser);
      throw new Error('Both data and hashs arguments are required');
    }
    
    if (foundUser) {
      const passOk = bcrypt.compareSync(password, foundUser.password);
      if (passOk) {
        jwt.sign({userId:foundUser._id,username}, jwtSecret, {}, (err, token) => {
          res.cookie('token', token, {sameSite:'none', secure:true}).json({
            id: foundUser._id,
          });
        });
      }
    }
  });
  
  app.post('/api/logout', (req,res) => {
    res.cookie('token', '', {sameSite:'none', secure:true}).json('ok');
  });
  
  app.post('/api/register', async (req,res) => {
    const {username,password} = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
      const createdUser = await User.create({
        username:username,
        password:hashedPassword,
      });

      jwt.sign({userId:createdUser._id,username}, jwtSecret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token, {sameSite:'none', secure:true}).status(201).json({
          id: createdUser._id,
        });
      });
    } catch(err) {
      if (err) throw err;
      res.status(500).json('error');
    }
  });
  
  const server = app.listen(4040);
  
  const wss = new ws.WebSocketServer({ server });
  
  wss.on('connection', (connection, req) => {
  
    function notifyAboutOnlinePeople() {
      [...wss.clients].forEach(client => {
        client.send(JSON.stringify({
          online: [...wss.clients].map(c => ({userId:c.userId,username:c.username})),
        }));
      });
    }
  
    connection.isAlive = true;
  
    connection.timer = setInterval(() => {
      connection.ping();

      connection.deathTimer = setTimeout(() => {
        connection.isAlive = false;
        clearInterval(connection.timer);
        connection.terminate();
        notifyAboutOnlinePeople();
        console.log('dead');
      }, 1000);
      
    }, 5000);
  
    connection.on('pong', () => {
      clearTimeout(connection.deathTimer);
    });
  
    // read username and id form the cookie for this connection
    const cookies = req.headers.cookie;
    if (cookies) {
      const tokenCookieString = cookies.split(';').find(str => str.startsWith('token='));
      if (tokenCookieString) {
        const token = tokenCookieString.split('=')[1];
        if (token) {
          jwt.verify(token, jwtSecret, {}, (err, userData) => {
            if (err) throw err;
            const {userId, username} = userData;
            connection.userId = userId;
            connection.username = username;
          });
        }
      }
    }
  
    connection.on('message', async (message) => {
      const messageData = JSON.parse(message.toString());
      console.log("Message : " , messageData);
      const {recipient, text, file} = messageData;
      let filename = null;
      console.log("jhhjr");
      if (file) {
        try {
          const myCloud = await cloudinary.v2.uploader.upload(file.data, {
            folder: "messages",
            width: 250,
            crop: 'fit'
          });
    
          filename = myCloud.public_id;

          // console.log("image file name", filename);
        } catch (error) {
          console.error('Error uploading file to Cloudinary:', error);
          // Handle the error appropriately
        }
      }
      if (recipient && (text || file)) {
        const messageDoc = await Message.create({
          sender: connection.userId,
          recipient,
          text,
          file: file ? filename : null,
        });
        // console.log('created message');
        [...wss.clients]
            .filter(c => c.userId === recipient)
            .forEach(c => c.send(JSON.stringify({
              text,
              sender: connection.userId,
              recipient,
              file: file ? filename : null,
              _id: messageDoc._id,
            })));
        }
      });
  
    // notify everyone about online people (when someone connects)
    notifyAboutOnlinePeople();
  });