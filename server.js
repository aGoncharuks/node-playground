const http = require('http');
const url = require('url');
const fs = require('fs');
const mime = require('mime');
const config = require('config');
const path = require('path');


module.exports = http.createServer((req, res) => {

	/**
	 * Get path and remove first symbol '/' from path to get file name
	 */
	let pathName = decodeURI(url.parse(req.url).pathname);
	let fileName = pathName.slice(1);

	/**
	 * Check if fileName doesn't include '/' or '..' symbols
	 */
	if(fileName.includes('/') || fileName.includes('..')) {
		res.statusCode = 400;
		res.end('File name should not include nesting');
		return;
	}

	/**
	 * If getting file
	 */
	if(req.method === 'GET') {
		if(pathName === '/') {
			sendFile(path.join(config.get('publicRootDir'), 'index.html'), res);
		} else {
			sendFile(path.join(config.get('filesRootDir'), fileName), res);
		}
	}

	/**
	 * If sending file
	 */
	if(req.method === 'POST') {
		if(!fileName) {
			res.statusCode = 404;
			res.end('File name should not be empty');
		}
		getFile(path.join(config.get('filesRootDir'), fileName), req, res);
	}

	/**
	 * If delete file
	 */
	if(req.method === 'DELETE') {

		if(!fileName) {
			res.statusCode = 404;
			res.end('File name should not be empty');
		}

		fs.unlink(path.join(config.get('filesRootDir'), fileName), err => {
			if(!err) {
				res.statusCode = 200;
				res.end('OK');
				return;
			}
			if(err.code === 'ENOENT') {
				res.statusCode = 404;
				res.end('File not found');
			} else {
				res.statusCode = 500;
				res.end('Internal server error');
			}
		});
	}
});

/**
 * Send file
 * @param fileName
 * @param res
 */
function sendFile(fileName, res) {
	let fileStream = fs.createReadStream(fileName);
	fileStream.pipe(res);

	fileStream.on('error', err => {
		let errorMsg = '';

		if(err.code === 'ENOENT') {
			res.statusCode = 404;
			errorMsg = 'File not found';
		} else if(!res.headersSent) {
			res.statusCode = 500;
			errorMsg = 'Internal server error';
		}

		res.end(errorMsg);
	});

	/**
	 * Set proper response content type depending on requested file mime type
	 */
	fileStream.on('open', () => {
		res.setHeader('Content-Type', mime.lookup(fileName));
	});

	/**
	 * Destroy file stream if connection was closed from client side
	 */
	fileStream.on('close', () => {
		fileStream.destroy();
	});
}

function getFile(filePath, req, res) {
	/** If content-length header is set => check if file size does not exceed allowed size limit */
	if(req.headers['content-length'] > config.get('maxFileSize')) {
		res.statusCode = 413;
		res.setHeader('Connection', 'close');
		res.end('File is too big');
	}

	let writeStream = fs.createWriteStream(filePath, {flags: 'wx'});
	let fileSize = 0;

	req
		.on('data', chunk=> {
			fileSize += chunk.length;

			if(fileSize > config.get('maxFileSize')) {

				res.statusCode = 413;
				res.setHeader('Connection', 'close');
				res.end('File is too big');
				writeStream.destroy();
				fs.unlink(filePath, ()=>{});
			}
		})
		.on('close', () => {
			writeStream.destroy();
			fs.unlink(filePath, ()=>{});
		})
		.pipe(writeStream);

	writeStream.on('error', err => {
		let errorMsg = '';

		if(err.code === 'EEXIST') {
			res.statusCode = 409;
			errorMsg = 'File with this name already exists';
		} else {
			if(!res.headersSent) {
				res.statusCode = 500;
				res.setHeader('Connection', 'close');
				errorMsg = 'Internal server error';
			}
			fs.unlink(filePath, ()=>{});
		}
		res.end(errorMsg);
	});

	writeStream.on('close', () => {
		res.end('OK');
	});
}

