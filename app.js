const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
var formatISO = require("date-fns/formatISO");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
    request.username = payload.username;
  }
};

initializeDbAndServer();

function authenticateToken(request, response, next) {
  let jwtToken;
  const tokenLocation = request.headers["authorization"];
  if (tokenLocation !== undefined) {
    jwtToken = tokenLocation.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "BLACK_PINK", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getUserQuery = `
            SELECT *
            FROM user
            WHERE username = "${username}";
        `;
  const userResponse = await db.get(getUserQuery);
  const encPassword = await bcrypt.hash(password, 10);
  let password_len = password.length;
  if (userResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password_len < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const newUserQuery = `
            INSERT INTO user(username, password, name, gender)
            VALUES("${username}", "${encPassword}", "${name}", "${gender}");
            `;
      const dbResponse = await db.run(newUserQuery);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = "${username}";
        `;
  const userInDb = await db.get(getUserQuery);
  if (userInDb === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, userInDb.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "BLACK_PINK");
      response.send({ jwtToken: jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getTweetsQuery = `
  SELECT username, tweet, date_time
  FROM user NATURAL JOIN tweet
  WHERE user_id IN
  (
      SELECT following_user_id
      FROM user INNER JOIN follower ON
      user.user_id = follower.follower_user_id
      WHERE username = "${username}"
  )
  ORDER BY date_time DESC
  LIMIT 4;
  `;
  const followerTweets = await db.all(getTweetsQuery);
  response.send(followerTweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followersQuery = `
    SELECT name
    FROM user
    WHERE user_id IN
    (
        SELECT following_user_id
        FROM user INNER JOIN follower ON
        user.user_id = follower.follower_user_id
        WHERE username = "${username}"
    );
    `;
  const following = await db.all(followersQuery);
  response.send(following);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userFollowersQuery = `
  SELECT name
  FROM user
  WHERE user_id IN
  (
    SELECT follower_user_id
    FROM follower INNER JOIN user ON
    user.user_id = follower.following_user_id
    WHERE username = "${username}"
  );
    `;
  const userFollowers = await db.all(userFollowersQuery);
  response.send(userFollowers);
});
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getTweetIdQuery = `
  SELECT tweet_id
  FROM user NATURAL JOIN tweet
  WHERE user_id IN
  (
      SELECT following_user_id
      FROM user INNER JOIN follower ON
      user.user_id = follower.follower_user_id
      WHERE username = "${username}"
  );
  `;
  const tweetIDs = await db.all(getTweetIdQuery);
  let id_Array = [];
  for (let id of tweetIDs) {
    id_Array.push(id.tweet_id);
  }

  if (id_Array.includes(parseInt(tweetId))) {
    const tweetReplayQuery = `
    SELECT
    COUNT(reply_id) AS replies,
    tweet.date_time
    FROM tweet INNER JOIN reply ON
    tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = "${tweetId}"
    GROUP BY tweet.tweet_id;
    `;
    const tweetReply = await db.all(tweetReplayQuery);
    const tweetLikesQuery = `
    SELECT tweet,
    COUNT(like_id) AS likes
    FROM tweet INNER JOIN like ON
    tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = "${tweetId}"
    GROUP BY tweet.tweet_id;
    `;
    const tweetLikes = await db.all(tweetLikesQuery);
    let newObj = tweetLikes[0];
    newObj["replies"] = tweetReply[0].replies;
    newObj["dateTime"] = tweetReply[0].date_time;
    response.send([newObj]);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetIdQuery = `
  SELECT tweet_id
  FROM user NATURAL JOIN tweet
  WHERE user_id IN
  (
      SELECT following_user_id
      FROM user INNER JOIN follower ON
      user.user_id = follower.follower_user_id
      WHERE username = "${username}"
  );
  `;
    const tweetIDs = await db.all(getTweetIdQuery);
    let id_Array = [];
    for (let id of tweetIDs) {
      id_Array.push(id.tweet_id);
    }

    if (id_Array.includes(parseInt(tweetId))) {
      const likedUsersQuery = `
      SELECT name
      FROM user INNER JOIN like ON
      user.user_id = like.user_id
      WHERE like.tweet_id = "${tweetId}";
      `;
      const likedUsers = await db.all(likedUsersQuery);
      let likedUsersArray = [];
      for (let nameObj of likedUsers) {
        likedUsersArray.push(nameObj.name);
      }
      response.send({ likes: likedUsersArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetIdQuery = `
        SELECT tweet_id
        FROM user NATURAL JOIN tweet
        WHERE user_id IN
        (
            SELECT following_user_id
            FROM user INNER JOIN follower ON
            user.user_id = follower.follower_user_id
            WHERE username = "${username}"
        );
      `;
    const tweetIDs = await db.all(getTweetIdQuery);
    let id_Array = [];
    for (let id of tweetIDs) {
      id_Array.push(id.tweet_id);
    }

    if (id_Array.includes(parseInt(tweetId))) {
      const tweetRepliesQuery = `
        SELECT name, reply
        FROM user INNER JOIN reply ON
        user.user_id = reply.user_id
        WHERE tweet_id = "${tweetId}";
        `;
      const tweetReply = await db.all(tweetRepliesQuery);
      response.send({ replies: tweetReply });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userTweetsQuery = `
    SELECT tweet, tweet_id, date_time
    FROM user INNER JOIN tweet ON
    user.user_id = tweet.user_id
    WHERE username = "${username}";
    `;
  const userTweets = await db.all(userTweetsQuery);
  let userTweetsDetailsArr = [];
  for (let everyObj of userTweets) {
    id = everyObj.tweet_id;
    const replyQuery = `
      SELECT COUNT(reply) AS replies
      FROM user INNER JOIN reply ON
      user.user_id = reply.user_id
      WHERE tweet_id = "${id}"
      GROUP BY tweet_id;
      `;
    const reply = await db.all(replyQuery);
    const likeQuery = `
      SELECT COUNT(like_id) AS likes
      FROM user INNER JOIN like ON
      user.user_id = like.user_id
      WHERE tweet_id = "${id}"
      GROUP BY tweet_id;
      `;
    const like = await db.all(likeQuery);
    let userTweetsDetailsObj = {
      tweet: everyObj.tweet,
      likes: like[0].likes,
      replies: reply[0].replies,
      dateTime: everyObj.date_time,
    };
    userTweetsDetailsArr.push(userTweetsDetailsObj);
  }
  response.send(userTweetsDetailsArr);
});
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const userIdQuery = `
    SELECT user_id
    FROM user
    WHERE username = "${username}";
    `;
  const userIdArr = await db.get(userIdQuery);
  const userId = userIdArr.user_id;

  const dateTime = new Date();
  let year = dateTime.getFullYear();
  let month = dateTime.getMonth();
  let date = dateTime.getDate();
  let hours = dateTime.getHours();
  let minutes = dateTime.getMinutes();
  let seconds = dateTime.getSeconds();
  let tweet_date = new Date(year, month, date, hours, minutes, seconds);
  const newTweetQuery = `
  INSERT INTO tweet(tweet, user_id,date_time)
  VALUES("${tweet}",${userId},"${tweet_date}")
  `;
  db.run(newTweetQuery);
  response.send("Created a Tweet");
});
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userTweetsQuey = `
    SELECT tweet_id
    FROM user NATURAL JOIN tweet
    WHERE username = "${username}";
    `;
    const userTweetId = await db.all(userTweetsQuey);
    let arrOfTweetId = [];
    for (let idObj of userTweetId) {
      arrOfTweetId.push(idObj.tweet_id);
    }
    console.log(arrOfTweetId);
    console.log(tweetId);

    if (arrOfTweetId.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = "${tweetId}";
      `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
