﻿var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var fs = require('fs');
var azure = require('azure');

var pictures = {};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
	res.sendfile(path.join(__dirname, 'public', 'index.htm'));
});

io.set('log level', 1);
io.on('connection', function (socket) {
	socket.on('images', function (partKey, fn) {
		if (pictures[partKey]) {
			fn(pictures[partKey]);
		} else {
			var query = azure.TableQuery
			.select('RowKey')
			.from('images')
			.where('PartitionKey eq ?', partKey);

			tableService.queryEntities(query, function (error, entities) {
				if (error) return console.error(error);

				pictures[partKey] = entities.map(function (entity) {
					return entity.RowKey;
				});
				fn(pictures[partKey]);
			});
		}
	});
});

module.exports = function (client) {
	if (!process.env.AZURE_STORAGE_ACCOUNT || !process.env.AZURE_STORAGE_ACCESS_KEY) {
		var userData = JSON.parse(fs.readFileSync(path.join(__dirname, 'plugins', '.azure'), { encoding: 'utf8' }));

		process.env.AZURE_STORAGE_ACCOUNT = userData.name;
		process.env.AZURE_STORAGE_ACCESS_KEY = userData.key;
	}

	if (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_ACCESS_KEY) {
		tableService = azure.createTableService();
		tableService.createTableIfNotExists('images', function () { });

		var date = new Date();
		var partKey = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()).toString();

		var query = azure.TableQuery
			.select('RowKey')
			.from('images')
			.where('PartitionKey eq ?', partKey);

		tableService.queryEntities(query, function (error, entities) {
			if (error) return console.error(error);

			pictures[partKey] = entities.map(function (entity) {
				return entity.RowKey;
			});
		});

		client.on('azure:image', function (blobId, partKey) {
			pictures[partKey].push(blobId);

			io.sockets.emit('image', { blob: blobId, part: partKey });
		});
	}

	server.listen(process.env.PORT || 80);
};