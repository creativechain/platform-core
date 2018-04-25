let Database = require('better-sqlite3');
let {File} = require('../utils');
let Error = require('../error');

/**
 *
 * @param {string} databaseFile
 * @param {string} creationFile
 * @param {boolean} debug
 * @constructor
 */
function IndexDB (databaseFile, creationFile, debug = true) {

    if (!creationFile || !File.exist(creationFile)) {
        throw Error.NO_DB_CREATION_FILE
    }

    let db = new Database(databaseFile);
    db.creationFile = creationFile;
    db.debug = debug;

    return db;
}

IndexDB.prototype = Database.prototype;

/**
 *
 * @param {string} query
 * @param callback
 */
IndexDB.prototype.select = function(query, callback) {

    try {
        let statement = this.prepare(query);
        let rows = statement.all();
        if (callback) {
            if (!rows) {
                rows = [];
            } else if (!Array.isArray(rows)) {
                rows = [rows];
            }

            callback(null, rows);
        }
    } catch (e) {
        if (callback) {
            callback(e.stack.toString(), null);
        }
    }

};

/**
 *
 * @param {string} query
 * @param callback
 */
IndexDB.prototype.run = function(query, callback) {
    //console.log('Executing', query);
    let err = null;
    try {
        let stmnt = this.prepare(query);
        stmnt.run();
    } catch (e) {
        err = e;
    }

    if (callback) {
        callback(err.stack.toString(), null);
    }
};

IndexDB.prototype.migrate = function (migrationDir, callback) {
    let that = this;

    if (migrationDir && File.exist(migrationDir)) {

        let callCallback = function (err) {
            if (callback) {
                callback(err);
            }
        };

        this.select('PRAGMA user_version;', function (err, result) {
            if (err) {
                callCallback(err);
            } else {
                let performMigration = function (version) {
                    let file = migrationDir + version + '.sql';
                    if (File.exist(file)) {
                        let queries = File.read(file);
                        that.run(queries, function (err) {
                            if (!err) {
                                performMigration(++version);
                            } else {
                                callCallback(err)
                            }
                        })
                    } else {
                        callCallback(null)
                    }
                };

                let version = parseInt(result[0].user_version);
                if (version === 0) {
                    let sqlCreationQueries = File.read(that.creationFile);
                    that.exec(sqlCreationQueries, function (err) {
                        if (err) {
                            callCallback(err);
                        } else {
                            performMigration(++version);
                        }
                    });
                } else {
                    performMigration(version);
                }
            }
        })
    }
};

/**
 *
 * @param lastExploredBlock
 * @param callback
 */
IndexDB.prototype.insertLastExploredBlock = function(lastExploredBlock, callback) {
    let insertPlatform = this.prepare('INSERT INTO Platform VALUES (?, ?)');
    insertPlatform.run('', lastExploredBlock);
    if (callback) {
        callback();
    }
};

IndexDB.prototype.updateLastExploredBlock = function(lastExploredBlock, callback) {
    this.run('UPDATE Platform SET lastExploredBlock = ' + lastExploredBlock + ' WHERE lastExploredBlock >= 0', callback);
};

IndexDB.prototype.getLastExploredBlock = function(callback) {
    this.select('SELECT * FROM Platform LIMIT 1', callback);
};

/**
 *
 * @param {Author} user
 * @param {DecodedTransaction} tx
 * @param {number} date
 * @param callback
 */
IndexDB.prototype.addAuthor = function(user, tx, date, callback) {
    let insertUser = this.database.prepare('REPLACE INTO Author VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let that = this;
    this.getAuthor(user.address, user.address, function (err, result) {

        if (err) {
            console.error(err);
        } else if (result.length > 0) {
            date = result[0].creation_date;
        }

        insertUser.run(tx.hash, user.version, date, user.nick, user.address, user.email, user.web, user.description, user.avatar, JSON.stringify(user.tags));

        that.insertUserTags(user.address, user.tags);

        if (callback) {
            callback();
        }
    });
};

/**
 *
 *
 * @param {string} userAddress
 * @param {Array} tags
 */
IndexDB.prototype.insertUserTags = function(userAddress, tags) {
    let insertTag = this.database.prepare('REPLACE INTO UserTags VALUES (?, ?)');
    if (tags) {
        tags.forEach(function (tag) {
            tag = tag.toLowerCase();
            insertTag.run(tag, userAddress);
        })
    }

};

/**
 *
 * @param {string} address
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getAuthor = function(address, userAddress, callback) {
    this.select("SELECT a.*, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != '" + address + "' AND l.content_id = m.address AND m.author = '" + address + "') AS likes, " +
        "(SELECT count(*) FROM 'Comment' c, Media m WHERE c.author != '" + address + "' AND m.author = '" + address + "' AND c.content_id = m.address) AS comments, " +
        "(SELECT count(*) FROM 'Media' m WHERE m.author = '" + address + "') AS publications, " +
        "(SELECT count(*) FROM 'Following' f WHERE f.type = 6 AND f.followed_address = '" + address +"') AS followers, " +
        "(SELECT count(*) FROM 'Following' f2 WHERE f2.type = 6 AND f2.followed_address = '" + address +"' AND f2.follower_address = '" + userAddress + "') AS user_following, " +
        "(SELECT t.file FROM 'Torrent' t WHERE a.avatar = t.magnet) AS avatarFile " +
        "From Author a WHERE a.address = '" + address + "'", callback);
};

/**
 *
 * @param ipfsCid
 * @param {string} file
 * @param callback
 */
IndexDB.prototype.insertTorrent = function(ipfsCid, file, callback) {
    let insertTorrent = this.database.prepare('REPLACE INTO Torrent VALUES (?, ?, ?)');
    insertTorrent.run(ipfsCid.infoHash, ipfsCid.CID, file);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {string} author
 * @param {number} type
 * @param {string} resource
 * @param {number} date
 * @param callback
 */
IndexDB.prototype.insertNotification = function(author, type, resource, date, callback) {
    let inserNotification = this.database.prepare('INSERT INTO Notification VALUES (?, ?, ?, ?, ?)');
    inserNotification.run(author, type, resource, date, 0);
    if (callback) {
        callback();
    }
};


/**
 *
 * @param callback
 * @param {number} limit
 */
IndexDB.prototype.getNotifications = function(callback, limit = 50) {
    this.select("SELECT * FROM Notification, Author WHERE author = address ORDER BY on_date DESC LIMIT " + limit + ";", callback);
};

/**
 *
 * @param {string} address
 * @param callback
 * @param {number} limit
 */
IndexDB.prototype.getNotificationsByAuthor = function(address, callback, limit = 50) {
    this.select("SELECT * FROM Notification, Author WHERE author = address AND author = '" + address + "' ORDER BY on_date DESC LIMIT " + limit + ";", callback);
};

/**
 *
 * @param callback
 * @param {number} limit
 */
IndexDB.prototype.getUnviewedNotifications = function(callback, limit = 50) {
    this.select('SELECT * FROM Notification, Author WHERE viewed = 0 AND author = address ORDER BY on_date DESC LIMIT ' + limit + ';', callback);
};

IndexDB.prototype.setViewedNotifications = function(callback) {
    this.run('UPDATE Notification SET viewed = 1 WHERE viewed = 0;')
};

/**
 *
 * @param {string} ipfsCid
 * @param callback
 */
IndexDB.prototype.getTorrent = function(ipfsCid, callback) {
    this.select('SELECT * FROM Torrent WHERE hash = ' + ipfsCid, callback);
};

/**
 *
 * @param {Comment} comment
 * @param {DecodedTransaction} tx
 * @param {number} date
 * @param callback
 */
IndexDB.prototype.addComment = function(comment, tx, date, callback) {
    let insertComment = this.database.prepare('REPLACE INTO Comment VALUES (?, ?, ?, ?, ?, ?)');
    insertComment.run(tx.hash, comment.version, comment.author, comment.contentAddress, comment.comment, date);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {string} contentAddress
 * @param callback
 */
IndexDB.prototype.getComments = function(contentAddress, callback) {
    this.select("SELECT c.*, " +
        " u.* FROM Comment c " +
        "LEFT JOIN " +
        "(SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c WHERE c.author = a.address) AS user_comments, " +
        "(SELECT count(*) FROM 'Like' l WHERE l.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Media' m WHERE m.author = a.address) AS publications FROM Author a) " +
        "u ON (u.user_address = c.author) WHERE c.content_id = '" + contentAddress + "' ORDER BY c.creation_date DESC;", callback);
};

/**
 *
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getUserComments = function(userAddress, callback) {
    this.select('SELECT * FROM Comment WHERE author = ' + userAddress, callback);
};

/**
 *
 * @param {AddressRelation} following
 * @param {DecodedTransaction} tx
 * @param {number} date
 * @param callback
 */
IndexDB.prototype.addFollowing = function(following, tx, date, callback) {
    let insertFollowing = this.database.prepare('REPLACE INTO Following VALUES (?, ?, ?, ?, ?, ?)');
    insertFollowing.run(tx.hash, following.version, date, following.followerAddress, following.followedAddress, following.type);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {Unfollow} following
 * @param callback
 */
IndexDB.prototype.removeFollowing = function(following, callback) {
    this.run("DELETE FROM Following WHERE Following.follower_address = '" + following.followerAddress + "' AND " +
        "Following.followed_address = '" + following.followedAddress + "' AND Following.type = 6;", callback);
};

/**
 *
 * @param {string} profileAddress
 * @param userAddress
 * @param callback
 */
IndexDB.prototype.getFollowers = function(profileAddress, userAddress, callback) {
    this.select("SELECT f.follower_address, " +
        "u.* FROM 'Following' f " +
        "LEFT JOIN (SELECT a.*, " +
        "(SELECT count(*) FROM 'Following' f2 WHERE a.address = f2.followed_address AND f2.follower_address = '" + userAddress + "' AND f2.type = " + PUBLICATION.TYPE.FOLLOW + ") AS is_following," +
        "(SELECT t.file FROM 'Torrent' t WHERE t.magnet = a.avatar) AS avatarFile FROM 'Author' a) u ON " +
        "(u.address = f.follower_address) WHERE f.followed_address = '" + profileAddress + "' AND f.type = " + PUBLICATION.TYPE.FOLLOW, callback);
};

/**
 *
 * @param {string} profileAddress
 * @param userAddress
 * @param callback
 */
IndexDB.prototype.getFollowing = function(profileAddress, userAddress, callback) {
    this.select("SELECT f.followed_address, " +
        "u.* FROM 'Following' f " +
        "LEFT JOIN (SELECT a.*, " +
        "(SELECT count(*) FROM 'Following' f2 WHERE a.address = f2.followed_address AND f2.follower_address = '" + userAddress + "' AND f2.type = " + PUBLICATION.TYPE.FOLLOW + ") AS is_following," +
        "(SELECT t.file FROM 'Torrent' t WHERE t.magnet = a.avatar) AS avatarFile FROM 'Author' a) u ON " +
        "(u.address = f.followed_address) WHERE f.follower_address = '" + profileAddress + "' AND f.type = " + PUBLICATION.TYPE.FOLLOW, callback);
};

/**
 *
 * @param {string} userAddress
 * @param {string} followedAddress
 * @param callback
 */
IndexDB.prototype.getFollower = function(userAddress, followedAddress, callback) {
    this.select("SELECT f.follower_address, " +
        "u.* FROM 'Following' f " +
        "LEFT JOIN (SELECT a.*, " +
        "(SELECT t.file FROM 'Torrent' t WHERE t.magnet = a.avatar) AS avatarFile " +
        "FROM 'Author' a) u ON " +
        "(u.address = f.follower_address) WHERE f.follower_address = '" + userAddress + "' AND f.followed_address = '" + followedAddress + "' AND f.type = " + PUBLICATION.TYPE.FOLLOW, callback);
};

/**
 *
 * @param {string} followerAddress
 * @param {string} followedAddress
 * @param {number} type
 * @param callback
 */
IndexDB.prototype.getFollowingData = function(followerAddress, followedAddress, type, callback) {
    this.select("SELECT f.*, " +
        "u.* FROM 'Following' f " +
        "LEFT JOIN (SELECT a.*, " +
        "(SELECT count(*) FROM 'Following' f2 WHERE a.address = f2.followed_address AND f2.follower_address = '" + followerAddress + "' AND f2.type = " + PUBLICATION.TYPE.FOLLOW + ") AS is_following," +
        "(SELECT t.file FROM 'Torrent' t WHERE t.magnet = a.avatar) AS avatarFile FROM 'Author' a) u ON " +
        "(u.address = f.followed_address) WHERE f.follower_address = '" + followerAddress + "' AND f.followed_address = '" + followedAddress + "' AND f.type = " + type + ";", callback);
};

/**
 *
 * @param {string} author
 * @param {string} resource
 * @param callback
 */
IndexDB.prototype.getBlocked = function(author, resource, callback) {
    this.getFollowingData(author, resource, PUBLICATION.TYPE.BLOCK, callback);
};

/**
 *
 * @param {Like} like
 * @param {DecodedTransaction} tx
 * @param callback
 */
IndexDB.prototype.addLike = function(like, tx, callback) {
    let insertLike = this.database.prepare('REPLACE INTO Like VALUES (?, ?, ?, ?)');
    insertLike.run(tx.hash, like.version, like.author, like.contentAddress);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {Unlike} unlike
 * @param {DecodedTransaction} tx
 * @param callback
 */
IndexDB.prototype.addUnlike = function(unlike, tx, callback) {
    let insertUnlike = this.database.prepare('REPLACE INTO Unlike VALUES (?, ?, ?, ?)');
    insertUnlike.run(tx.hash, unlike.version, unlike.author, unlike.contentAddress);

    if (callback) {
        callback();
    }
};

/**
 *
 * @param {Payment} payment
 * @param {DecodedTransaction} tx
 * @param callback
 */
IndexDB.prototype.addPayment = function(payment, tx, callback) {
    let insertPayment = this.database.prepare('REPLACE INTO Payment VALUES (?, ?, ?, ?, ?)');
    insertPayment.run(tx.hash, payment.version, payment.author, payment.contentAddress, payment.amount);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {string} contentId
 * @param callback
 */
IndexDB.prototype.getContentLikes = function(contentId, callback) {
    this.select('SELECT * FROM Like WHERE content_id = ' + contentId, callback);
};

/**
 *
 * @param {MediaData} media
 * @param {DecodedTransaction} tx
 * @param {number} date
 * @param callback
 */
IndexDB.prototype.addMedia = function(media, tx, date, callback) {
    let insertMedia = this.database.prepare('REPLACE INTO Media VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertMedia.run(tx.hash, media.version, date, media.userAddress, media.contentAddress, media.type, media.title,
        media.description, media.contentType, media.license, JSON.stringify(media.tags), media.price, media.publicContent,
        media.privateContent, media.hash, media.publicFileSize, media.privateFileSize);

    this.insertMediaTags(media.contentAddress, media.tags);
    if (callback) {
        callback();
    }
};

IndexDB.prototype.setMediaPrivateContent = function(contentAddress, privateContent) {
    this.run("UPDATE Media SET private_content = '" + privateContent + "' WHERE address = '" + contentAddress + "';");
};

/**
 *
 * @param {string} mediaAddress
 */
IndexDB.prototype.removeMedia = function(mediaAddress) {
    this.select("DELETE FROM Media WHERE address = '" + mediaAddress + "'");
};

/**
 *
 * @param {string} authorAddress
 */
IndexDB.prototype.removeMediaByAuthor = function(authorAddress) {
    this.select("DELETE FROM Media WHERE author = '" + authorAddress + "'");
};

/**
 *
 *
 * @param {string} mediaAddress
 * @param {Array} tags
 */
IndexDB.prototype.insertMediaTags = function(mediaAddress, tags) {
    let insertTag = this.database.prepare('REPLACE INTO MediaTags VALUES (?, ?)');
    if (tags) {
        tags.forEach(function (tag) {
            tag = tag.toLowerCase();
            insertTag.run(tag, mediaAddress);
        })
    }

};

/**
 *
 * @param {string} userAddress
 * @param {number} page
 * @param callback
 */
IndexDB.prototype.getAllMedia = function(userAddress, page, callback) {
    if (!page) {
        page = 1;
    }

    let offset = (page * 20) - 20;

    this.select("SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT count(*) FROM 'Like' ld WHERE ld.author = '" + userAddress + "' AND ld.content_id = m.address) AS user_liked, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) ORDER BY m.creation_date DESC LIMIT 20 OFFSET " + offset + ";", callback)
};

/**
 *
 * @param {string} contentId
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getMediaByContentId = function(contentId, userAddress, callback) {
    this.select("SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) WHERE m.txid = '" + contentId + "' ORDER BY m.creation_date DESC;", callback)
};

/**
 *
 * @param {string} address
 * @param callback
 * @param {string} userAddress
 */
IndexDB.prototype.getMediaByAddress = function(address, userAddress, callback) {
    this.select("SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m LEFT JOIN " +
        "(SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Like' ld WHERE ld.author = '" + userAddress + "' AND ld.content_id = '" + address + "') AS user_liked, " +
        "(SELECT count(*) FROM 'Unlike' uld WHERE uld.author = '" + userAddress + "' AND uld.content_id = '" + address + "') AS user_unliked, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) WHERE m.address = '" + address + "' ORDER BY m.creation_date DESC;", callback)
};

/**
 *
 * @param {string} authorAddress
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getMediaByAuthor = function(authorAddress, userAddress, callback) {
    this.select("SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT count(*) FROM 'Like' ld WHERE ld.author = '" + userAddress + "' AND ld.content_id = m.address) AS user_liked, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) WHERE m.author = '" + authorAddress + "' ORDER BY m.creation_date DESC;", callback)
};

IndexDB.prototype.getMediaByFollowerAddress = function(followerAddress, userAddress, page, callback) {
    if (!page) {
        page = 1;
    }

    let offset = (page * 20) - 20;

    this.select("SELECT f.follower_address, n.* FROM Following f " +
        "LEFT JOIN (SELECT m.*,  " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT count(*) FROM 'Like' ld WHERE ld.author = '" + userAddress + "' AND ld.content_id = m.address) AS user_liked, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON (u.user_address = m.author) " +
        ") n  " +
        "ON (n.author = f.followed_address) WHERE f.follower_address = '" + followerAddress + "' AND f.type = 6  AND n.address NOT NULL " +
        "ORDER BY n.creation_date DESC LIMIT 20 OFFSET " + offset + ";", callback)

};

IndexDB.prototype.getMediaByFollowedAddress = function(followedAddress, callback) {
    this.select("SELECT f.followed_address, n.* FROM Following f " +
        "LEFT JOIN (SELECT m.*,  " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.author != a.address AND l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON (u.user_address = m.author) " +
        ") n  " +
        "ON (n.author = f.follower_address) WHERE f.followed_address = '" + followedAddress + "' ORDER BY n.creation_date DESC;", callback)
};

/**
 *
 * @param {string} authorAddress
 * @param callback
 */
IndexDB.prototype.getMediaAddressByAuthor = function(authorAddress, callback) {
    this.select("SELECT m.address " +
        "FROM Media m " +
        "WHERE m.author = '" + authorAddress + "' " +
        "ORDER BY m.creation_date DESC", callback);
};

/**
 *
 * @param {string} updater
 * @param {string} os
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getPlatformUpdates = function(updater, os, userAddress, callback) {
    this.select("SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date,  " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c, Media m WHERE c.author != a.address AND m.author = a.address AND c.content_id = m.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l, Media m WHERE l.content_id = m.address AND m.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul, Media m WHERE ul.content_id = m.address AND m.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) WHERE m.author = '" + updater + "' AND m.title LIKE '%" + os + "%' ORDER BY m.creation_date DESC;", callback)
};

/**
 *
 * @param {string} address
 * @param callback
 */
IndexDB.prototype.resolveAddress = function(address, callback) {
    this.select('SELECT * FROM AddressBook WHERE AddressBook.address = "' + address + '";', callback);
};

/**
 *
 * @param {string} label
 * @param callback
 */
IndexDB.prototype.resolveLabel = function(label, callback) {
    this.select('SELECT * FROM AddressBook WHERE AddressBook.label = "' + label + '";', callback);
};

/**
 *
 * @param {string} label
 * @param {string} address
 * @param callback
 */
IndexDB.prototype.resolveAddressAndLabel = function(address, label, callback) {
    this.select('SELECT * FROM AddressBook WHERE AddressBook.address = "' + address + '" OR AddressBook.label = "' + label + '";', callback);
};

/**
 *
 * @param {string} address
 * @param callback
 */
IndexDB.prototype.removeAddress = function(address, callback) {
    this.run('DELETE FROM AddressBook WHERE AddressBook.address = "' + address + '";', callback);
};

/**
 *
 * @param {string} address
 * @param {string} label
 * @param callback
 */
IndexDB.prototype.insertAddressBook = function(address, label, callback) {
    let insertContact = this.database.prepare('REPLACE INTO AddressBook VALUES (?, ?)');
    insertContact.run(address, label);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {string} address
 * @param {string} label
 * @param callback
 */
IndexDB.prototype.updateAddressBook = function(address, label, callback) {
    let that = this;
    let onCreate = function () {
        that.insertAddressBook(address, label);
    };

    this.resolveAddressAndLabel(address, label, function (err, res) {
        if (res.length > 1) {
            callback(ErrorCodes.CONTACT_EXISTS);
        } else if (res.length === 1) {
            res = res[0];
            if (res.label === label) {
                that.run('UPDATE AddressBook SET address = "' + address + '" WHERE label = "' + label + '"', callback)
            } else {
                that.run('UPDATE AddressBook SET label = "' + label + '" WHERE address = "' + address + '"', callback)
            }
        } else {
            onCreate();
        }
    })
};

/**
 *
 * @param callback
 */
IndexDB.prototype.getAddressBook = function(callback) {
    this.select('SELECT * FROM AddressBook;', callback)
};

/**
 *
 * @param {string} address
 * @param {number} amount
 * @param {number} creationDate
 * @param {string} label
 * @param {string} message
 * @param callback
 */
IndexDB.prototype.insertPaymentRequest = function(address, amount, creationDate, label, message, callback) {
    let insertPaymentReq = this.database.prepare('REPLACE INTO PaymentRequest VALUES (?, ?, ?, ?, ?)');
    insertPaymentReq.run(address, amount, creationDate, label, message);
    if (callback) {
        callback();
    }
};

/**
 *
 * @param {string} address
 * @param callback
 */
IndexDB.prototype.getPaymentRequest = function(address, callback) {
    this.select('SELECT * FROM PaymentRequest WHERE address = "' + address + '"', callback);
};
/**
 *
 * @param callback
 */
IndexDB.prototype.getAllPaymentRequest = function(callback) {
    this.select('SELECT * FROM PaymentRequest', callback);
};

/**
 *
 * @param {string} hash
 * @param {string} CID
 * @param {string} path
 * @param {string} file
 * @param callback
 */
IndexDB.prototype.putTorrent = function(hash, CID, path, file, callback) {
    //console.log('Inserting torrent on db', hash, CID, path, file);
    let insertTorrent = this.database.prepare('REPLACE INTO Torrent VALUES (?, ?, ?, ?)');
    insertTorrent.run(hash, CID, path, file);
    if (callback) {
        callback();
    }

};

IndexDB.prototype.getAllTorrents = function(callback) {
    this.select('SELECT * FROM Torrent', callback)
};

/**
 *
 * @param {Array} tags
 * @param callback
 */
IndexDB.prototype.getContentTags = function(tags, callback) {
    let matches = {};
    let that = this;
    tags.forEach(function (tag, index) {
        that.select("SELECT * FROM ContentTags AS t WHERE t.tag LIKE '%" + tag + "%'", function (err, result) {
            if (result) {
                result.forEach(function (res) {
                    let dataId = res.data_id;
                    if (matches[dataId]) {
                        matches[dataId] = matches[dataId]++;
                    } else {
                        matches[dataId] = 1;
                    }
                });
            }

            if (index === tags.length && callback) {
                callback(matches);
            }
        });
    });
};

/**
 *
 * @param {Array} tags
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getMediaByTags = function(tags, userAddress, callback) {
    let query = "SELECT m.*, " +
        "(SELECT count(*) FROM 'Like' l WHERE m.address = l.content_id) AS likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE m.address = ul.content_id) AS unlikes, " +
        "(SELECT count(*) FROM Comment c WHERE m.address = c.content_id) AS comments, " +
        "(SELECT t.file FROM Torrent t WHERE t.magnet = m.public_content) AS featured_image, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = m.private_content) AS private_file, " +
        "(SELECT SUM(p.amount) FROM Payment p WHERE p.content_id = m.address GROUP BY p.content_id) AS received_amount, " +
        "u.* FROM Media m " +
        "LEFT JOIN (SELECT a.address AS user_address, a.name, a.email, a.web, a.description AS user_description, a.avatar, a.tags AS user_tags, a.creation_date AS user_creation_date, " +
        "(SELECT t2.file FROM Torrent t2 WHERE t2.magnet = a.avatar) AS avatarFile, " +
        "(SELECT count(*) FROM Comment c WHERE c.author = a.address) AS user_comments, " +
        "(SELECT count(*) FROM Following f WHERE f.follower_address = a.address AND f.type = 6) AS user_following, " +
        "(SELECT count(*) FROM Following f2 WHERE f2.followed_address = a.address AND f2.type = 6) AS user_followers, " +
        "(SELECT count(*) FROM Following f3 WHERE f3.followed_address = a.address AND f3.follower_address = '" + userAddress + "' AND f3.type = 6) AS following, " +
        "(SELECT count(*) FROM 'Like' l WHERE l.author = a.address) AS user_likes, " +
        "(SELECT count(*) FROM 'Unlike' ul WHERE ul.author = a.address) AS user_unlikes, " +
        "(SELECT count(*) FROM 'Media' m2 WHERE m2.author = a.address) AS publications FROM Author a) u ON " +
        "(u.user_address = m.author) WHERE ";

    tags.forEach(function (tag, index) {
        query += "m.tags LIKE '%" + tag + "%'";
        if (index < (tags.length -1)) {
            query += " OR ";
        }
    });

    query += " ORDER BY m.creation_date DESC;";
    this.select(query, callback);
};

/**
 *
 * @param {Array} tags
 * @param {string} userAddress
 * @param callback
 */
IndexDB.prototype.getAuthorsByTags = function(tags, userAddress, callback) {
    if (!tags.isEmpty()) {

        let query = 'SELECT a.*, ' +
            '(SELECT t.file FROM Torrent t WHERE t.magnet = a.avatar) AS avatarFile ' +
            'FROM Author a WHERE ';
        tags.forEach(function (tag, index) {
            query += "a.tags LIKE '%" + tag + "%' OR a.name LIKE '%" + tag + "%' OR a.address = '" + tag + "'";
            if (index < (tags.length -1)) {
                query += " OR ";
            }
        });

        let t = tags[0];
        query += ' ORDER BY (CASE ' +
            'WHEN a.address = "' + t + '" THEN 1 ' +
            'WHEN a.name = "' + t + '" THEN 2 ' +
            'WHEN a.name LIKE "' + t + '%" THEN 3 ' +
            'ELSE 3 END), a.name LIMIT 10';

        this.select(query, callback);
    }

};

IndexDB.prototype.getPayment = function(userAddress, contentAddress, callback) {
    this.select("SELECT * FROM Payment WHERE content_id = '" + contentAddress + "' AND author = '" + userAddress + "';", callback);
};

IndexDB.prototype.getDonationFromMedia = function(mediaAddress, callback) {
    this.select('SELECT * FROM Donation WHERE content_id = "' + mediaAddress + '" ORDER BY creation_date DESC', callback)
};

if (module) {
    module.exports = IndexDB;
}
