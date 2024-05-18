const express = require("express");
const app = express();
const http = require("http").Server(app);
const cors = require("cors");
const socketIO = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3000;

const random = (length) =>{
  return Math.floor(Math.random() * length)
}

const handleString = (string)=>{
    if(string){
        return string .trim().toLowerCase()
    }else{
        return ''
    }
}

let rooms = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

socketIO.on('connection',(socket)=>{
    console.log(`${socket.id} vừa kết nối`);
    socket.on('room-list',()=>{
        socket.emit('room-list',rooms)
    })

    socket.on('create-room',({idroom,password,maxPlayers, userId, userName, userAvatar})=>{
        const roominfo ={
            roomMaster: userId,
            roomMembers: [
                { 
                    socketId: socket.id,
                    Id: userId,
                    displayName: userName,
                    photoURL: userAvatar,
                    isReady: true,
                    isGhost: false,
                    answer: '',
                    votes: 0
                }
            ],
            maxPlayers,
            answers: [],
            round:0,
            isStart: false,
            keyword: {},
            memberAnswer: 0,
            isStartAnswer: false, 
            isStartVote: false,
            isEndRound2: false,
            isShowResult:false,
            isGuessKeyword:false,
            guessKeyword: [], 
            idroom,
            locked: password === '' ? false : password,
            winer: '',
            chats:[{displayName: 'Hệ thống: ', message: `${userName} đã vào phòng`, id: 'system'}],
            startTime: 0,
            duration: 16000
        }
        socket.join(idroom)
        rooms.push(roominfo)
        socketIO.to(idroom).emit('player-joined',roominfo)
        socketIO.to(idroom).emit('chats',roominfo.chats)
        socketIO.except(idroom).emit('room-list',rooms)
    })

    socket.on('join-room',({id,userId,userName, userAvatar})=>{
        const roominfo = rooms.find((room)=>room.idroom === id)
        if(roominfo){
            roominfo.roomMembers.push({ 
                socketId : socket.id,
                Id: userId,
                displayName: userName,
                photoURL: userAvatar,
                isReady: false,
                isGhost: false,
                answer: '',
                votes: 0
            })
            roominfo.chats.push({displayName: 'Hệ thống: ', message: `${userName} đã vào phòng`, id: 'system'})
        }
        socket.join(id)
        socketIO.to(id).emit('player-joined',roominfo)
        socketIO.to(id).emit('chats',roominfo.chats)
        socketIO.except(id).emit('room-list',rooms)
    })

    socket.on('out-room',({idroom, userId, userName})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom)
        if(roominfo){
            roominfo.roomMembers = roominfo.roomMembers.filter((member)=>member.Id !== userId)
            socket.leave(idroom)
            if(roominfo.roomMembers.length === 0){
                rooms = rooms.filter((room)=>room.idroom !== idroom)
            }else{
              if(userId === roominfo.roomMaster){
                    const num = random(roominfo.roomMembers.length)
                    roominfo.roomMaster = roominfo.roomMembers[num].Id
                    roominfo.roomMembers[num].isReady = true
              }
              roominfo.chats.push({displayName: 'Hệ thống: ', message: `${userName} đã rời phòng`, id: 'system'})
              socketIO.to(idroom).emit('player-joined',roominfo)
              socketIO.to(idroom).emit('chats',roominfo.chats)
            }
            socketIO.except(idroom).emit('room-list',rooms)
        }
    })

    socket.on('player-toggle-ready',({userId,idroom})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom)
        if(roominfo){
            const player = roominfo.roomMembers.find((member)=>member.Id === userId)
            player.isReady = !player.isReady
            socketIO.to(idroom).emit('player-joined',roominfo)
        }
    })

    socket.on('start-game',({keywords,idroom})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom)
        if(roominfo && keywords){
            roominfo.keyword = keywords[random(keywords.length)]
            const num1 = random(roominfo.roomMembers.length)
            roominfo.roomMembers[num1].isGhost = true
            if(roominfo.roomMembers.length > 5){
                let num2;
                do {
                    num2 = random(roominfo.roomMembers.length); 
                } while (num2 === num1); 
                roominfo.roomMembers[num2].isGhost = true
            }
            let answer = random(roominfo.roomMembers.length)
            roominfo.memberAnswer = answer
            roominfo.isStart = true
            roominfo.chats.push(
                {displayName: 'Hệ thống: ', message: 'Bắt đầu vòng 1', id: 'system'}, 
                {displayName: 'Hệ thống gợi ý: ', message: roominfo.keyword.suggest[0], id: 'system'}
            )
            socketIO.to(idroom).emit('player-joined',roominfo)
            socketIO.to(idroom).emit('chats',roominfo.chats)
            socketIO.except(idroom).emit('room-list',rooms)
            roominfo.startTime = Date.now()
            roominfo.duration = 16000
            const idInterval = setInterval(()=>{
                let remainTime = Math.floor((roominfo.duration - (Date.now()-roominfo.startTime))/1000)
                if(!roominfo.isShowResult && !roominfo.isEndRound2){
                    socketIO.to(idroom).emit('updateCountdown', remainTime)
                }
                if(remainTime === 0 && roominfo.round === 0){
                    roominfo.round = 1
                    roominfo.isStartAnswer = true
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    roominfo.startTime = Date.now()
                }else if(remainTime === 0 && roominfo.isStartAnswer){
                    roominfo.roomMembers[roominfo.memberAnswer].answer = "..."
                    roominfo.answers.push({displayName: roominfo.roomMembers[roominfo.memberAnswer].displayName, answer: "..."})
                    roominfo.memberAnswer = (roominfo.memberAnswer + 1)%roominfo.roomMembers.length
                    if(roominfo.answers.length === roominfo.roomMembers.length || roominfo.answers.length === roominfo.roomMembers.length*2){
                        roominfo.isStartVote = true
                        roominfo.isStartAnswer = false
                        roominfo.chats.push({displayName: 'Hệ thống: ', message: 'Kết thúc vòng chơi, bắt đầu bình chọn', id: 'system'})
                    }
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    socketIO.to(idroom).emit('chats',roominfo.chats)
                    roominfo.startTime = Date.now()
                }else if(remainTime === 0 && roominfo.isStartVote && roominfo.round === 1){
                    roominfo.roomMembers.forEach(member => {
                        member.answer = ""
                    })
                    roominfo.isStartAnswer = true
                    roominfo.isStartVote = false
                    roominfo.round = 2
                    roominfo.chats.push(
                        {displayName: 'Hệ thống: ', message: 'Bắt đầu vòng 2', id: 'system'}, 
                        {displayName: 'Hệ thống gợi ý: ', message: roominfo.keyword.suggest[1], id: 'system'}
                    )
                    socketIO.to(idroom).emit('chats',roominfo.chats)
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    roominfo.startTime = Date.now()
                }else if(remainTime === 0 && roominfo.isStartVote && roominfo.round === 2){
                    roominfo.roomMembers.forEach(member => {
                        member.answer = ""
                    })
                    roominfo.isEndRound2 = true
                    roominfo.isStartVote = false
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    roominfo.duration = 5000
                    roominfo.startTime = Date.now()
                }else if(remainTime === 0 && roominfo.isEndRound2){
                    const topVotes = [...roominfo.roomMembers]
                    const top3 = topVotes.sort((a, b) => b.votes - a.votes).slice(0,3)
                    let count = 0
                    top3.forEach((top)=>{
                        if(top.isGhost){
                            ++count
                        }
                    })
                    if((roominfo.roomMembers.length > 5 && count !== 2) || (roominfo.roomMembers.length <= 5 && count !== 1)){
                        roominfo.isEndRound2 = false
                        roominfo.winer = 'Ghost'     
                        roominfo.isShowResult = true
                        socketIO.to(idroom).emit('player-joined',roominfo)
                        roominfo.duration = 4000
                        roominfo.startTime = Date.now()
                    }else{
                        roominfo.isGuessKeyword = true
                        roominfo.chats.push({displayName: 'Hệ thống: ', message: 'Village đã bắt được các Evil Ghost, các Evil Ghost hãy đoán từ khóa', id: 'system'})
                        roominfo.isEndRound2 = false
                        socketIO.to(idroom).emit('player-joined',roominfo)
                        socketIO.to(idroom).emit('chats',roominfo.chats)
                        roominfo.duration = 15000
                        roominfo.startTime = Date.now()
                    }
                }else if(remainTime === 0 && roominfo.isShowResult){
                    roominfo.chats.push({displayName: 'Hệ thống: ', message: 'Kết thúc lượt chơi', id: 'system'})
                    let memberMaster = null
                    roominfo.roomMembers = roominfo.roomMembers.filter((mb)=>{
                        if(mb.socketId === null){
                            roominfo.chats.push({displayName: 'Hệ thống: ', message: `${mb.displayName} đã rời phòng`, id: 'system'})
                            if (mb.Id === roominfo.roomMaster){
                                memberMaster = mb
                            }
                        }
                        return mb.socketId !== null
                    })
                    if(roominfo.roomMembers.length === 0){
                        rooms = rooms.filter((room)=>room.idroom !== idroom)
                    }else{
                        if(memberMaster !== null){
                            const num = random(roominfo.roomMembers.length)
                            roominfo.roomMaster = roominfo.roomMembers[num].Id
                            roominfo.roomMembers[num].isReady = true
                        }
                        roominfo.roomMembers.forEach((mb)=>{
                            if(mb.Id !== roominfo.roomMaster){
                                mb.isReady = false
                            }
                            mb.answer = ''
                            mb.isGhost = false
                            mb.votes = 0
                        })
                        roominfo.answers = [], 
                        roominfo.guessKeyword = [],
                        roominfo.round = 0
                        roominfo.isStart = false
                        roominfo.isShowResult = false
                    }
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    socketIO.to(idroom).emit('chats',roominfo.chats)
                    socketIO.except(idroom).emit('room-list',rooms)
                    clearInterval(idInterval)
                }else if(remainTime === 0 && roominfo.isGuessKeyword){
                    let flag = false
                    roominfo.guessKeyword.forEach((key)=>{
                        if(handleString(key)===handleString(roominfo.keyword.key)){
                            flag = true
                        }
                    })
                    if(flag){
                        roominfo.winer = 'Ghost'
                    }else{
                        roominfo.winer = 'Village'
                    }
                    roominfo.isShowResult = true
                    roominfo.isGuessKeyword = false
                    socketIO.to(idroom).emit('player-joined',roominfo)
                    roominfo.duration = 4000
                    roominfo.startTime = Date.now()
                }
            },200)
        }
    })
    
    socket.on('player-confirm-answer',({text, userId, idroom})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom) 
        if(!roominfo.isGuessKeyword){
            roominfo.roomMembers[roominfo.memberAnswer].answer = text
            roominfo.answers.push({displayName: roominfo.roomMembers[roominfo.memberAnswer].displayName, answer: text})
            roominfo.memberAnswer = (roominfo.memberAnswer + 1)%roominfo.roomMembers.length
            if(roominfo.answers.length === roominfo.roomMembers.length || roominfo.answers.length === roominfo.roomMembers.length*2){
                roominfo.isStartVote = true
                roominfo.isStartAnswer = false
                roominfo.chats.push({displayName: 'Hệ thống: ', message: 'Kết thúc vòng chơi, bắt đầu bình chọn', id: 'system'})
                socketIO.to(idroom).emit('chats',roominfo.chats)
            }
            socketIO.to(idroom).emit('player-joined',roominfo)
            roominfo.startTime = Date.now()
        }else{
            roominfo.roomMembers.forEach(mb=>{
                if(mb.Id === userId){
                    mb.answer = text
                }
            })
            roominfo.guessKeyword.push(text)
            socketIO.to(idroom).emit('player-joined',roominfo)

        }
    })
    socket.on('player-vote',({userId,idroom})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom) 
        const player = roominfo.roomMembers.find((member)=>member.Id === userId)
        ++player.votes
    })

    socket.on('send-msg',({idroom, userName, message, userId})=>{
        const roominfo = rooms.find((room)=>room.idroom === idroom) 
        if(roominfo){
            roominfo.chats.push({displayName: userName, message: message, id: userId})
            socketIO.to(idroom).emit('chats',roominfo.chats)
        }
    })

    socket.on('disconnect',()=>{
        console.log(`${socket.id} vừa ngắt kết nối`);
        const roominfo = rooms.find(room =>{
            const finalRoom = room.roomMembers.filter(mb => mb.socketId === socket.id)
            return finalRoom.length > 0
        })
        if(roominfo){
            const member = roominfo.roomMembers.find((member)=>member.socketId === socket.id)
            if(roominfo.isStart){
                member.socketId = null
            }else{
                roominfo.roomMembers = roominfo.roomMembers.filter((mb)=>{
                    if(mb.socketId === socket.id){
                        roominfo.chats.push({displayName: 'Hệ thống: ', message: `${mb.displayName} đã rời phòng`, id: 'system'})
                        socketIO.to(roominfo.idroom).emit('chats',roominfo.chats)
                    }
                    return mb.socketId !== socket.id
                })
                if(roominfo.roomMembers.length === 0){
                    rooms = rooms.filter((room)=>room.idroom !== roominfo.idroom)
                }else if (member.Id === roominfo.roomMaster){
                    const num = random(roominfo.roomMembers.length)
                    roominfo.roomMaster = roominfo.roomMembers[num].Id
                    roominfo.roomMembers[num].isReady = true
                }
            }
            socketIO.to(roominfo.idroom).emit('player-joined',roominfo)
            socketIO.except(roominfo.idroom).emit('room-list',rooms)
        }
    })
    socket.on('log-roominfo',({roomid})=>{
        const roominfo = rooms.find((room)=>room.idroom === roomid) 
        console.log(roominfo);
    })
})

app.get("/api", (req, res) => {
    res.json(rooms);
});

http.listen(PORT, () => {
    console.log(`Server is listeing on ${PORT}`);
});