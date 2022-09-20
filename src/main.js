// Template Engine: Pug
// CSS framework : TailwindCSS

const Koa = require('koa');
const Pug = require('koa-pug');
const path = require('path');
const serve = require('koa-static');
const mount = require('koa-mount');
const route = require('koa-route');
const websockify = require('koa-websocket');
const mongoClient = require('./mongo');
const morgan = require('morgan');
require('dotenv').config();

const app = websockify(new Koa());

// test환경에서는 로그가 찍히지 않도록 함
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const pug = new Pug({
  viewPath: path.resolve(__dirname, './views'),
  app: app, // Binding `ctx.render()`, equals to pug.use(app)
});
// tailwindCSS 정적 경로 설정
app.use(mount('/dist', serve(__dirname + '/../dist')));
// static 파일 내려주기
app.use(mount('/public', serve('src/public')));

app.use(async (ctx) => {
  await ctx.render('main');
});

const _client = mongoClient.connect();

async function getChatsCollection() {
  const client = await _client;
  return client.db('chat').collection('chats');
}

// Using routes
app.ws.use(
  route.all('/ws', async (ctx) => {
    const chatsCollection = await getChatsCollection();
    const chatsCursor = chatsCollection.find(
      {},
      {
        sort: {
          createdAt: 1,
        },
      }
    );

    const chats = await chatsCursor.toArray();
    ctx.websocket.send(
      JSON.stringify({
        type: 'sync',
        payload: {
          chats,
        },
      })
    );

    ctx.websocket.on('message', async (data) => {
      if (typeof data !== 'string') {
        return;
      }
      const chat = JSON.parse(data);

      chatsCollection.insertOne({
        ...chat,
        createdAt: new Date(),
      });

      const { message, nickname } = chat;

      const { server } = app.ws;

      if (!server) {
        return;
      }

      server.clients.forEach((client) => {
        client.send(
          JSON.stringify({
            type: 'chat',
            payload: {
              nickname,
              message,
            },
          })
        );
      });
    });
  })
);

app.listen(5000);
