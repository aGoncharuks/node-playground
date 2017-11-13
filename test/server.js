const server = require('../server');
const request = require('request-promise');
const config = require('config');
const fs = require('fs-extra');
const assert = require('assert');
const expect = require('chai').expect;

const host = `http://${config.get('host')}:${config.get('port')}`;

/**
 * Before executing tests make sure you run script in test environment
 */
describe('Environment tests', () => {

	it('Running in test environment', () => {
		expect(process.env.NODE_ENV).to.exist;
		expect(process.env.NODE_ENV).to.equal('test');
	});
});

describe('Server tests', () => {
  let app;

  /**
   * Launch server before tests
   */
  before((done) => {
    app = server.listen(config.get('port'), () => {
      done();
    });
  });

  /** Close server after tests */
  after((done) => {
    app.close(() => {
      done();
    });
  });

	/**
   * Test getting files
   */
  context('Getting files', () => {

	  context('Index.html', () => {
		  it('Returns public/index.html & status 200', async () => {
			  let fixtureContent = fs.readFileSync(config.get('publicRootDir') + '/index.html', {
				  encoding: 'utf-8'
			  });
			  let content = await request.get('http://localhost:3001');
			  expect(content).to.equal(fixtureContent);
		  });
	  });

    context('When file exists', () => {

	    /**
       * Clean files folder and put mock file in files folder before each test
	     */
	    beforeEach(() => {
		    fs.emptyDirSync(config.get('filesRootDir'));
		    fs.copyFileSync(config.get('fixturesRootDir') + '/file_mock.png', config.get('filesRootDir') + '/file_mock.png');
	    });

	    it('Returns file & status 200', async () => {
		    let fixtureContent = fs.readFileSync(config.get('fixturesRootDir') + '/file_mock.png', {
		      encoding: 'utf8'
        });
		    let response = await request.get('http://localhost:3001/file_mock.png', {
			    resolveWithFullResponse: true
        });
		    expect(response.body).to.equal(fixtureContent);
		    expect(response.statusCode).to.equal(200);
	    });
    });

	  context('When file does not exist', () => {

		  /**
		   * Clean files folder before each test
		   */
		  beforeEach(() => {
			  fs.emptyDirSync(config.get('filesRootDir'));
		  });

		  it('Returns 404', async () => {
        let statusCode = await request.get('http://localhost:3001/file_mock.png', {
          resolveWithFullResponse: true
        }).then(
          response => response.statusCode,
				  error => error.statusCode
        );
			  expect(statusCode).to.equal(404);
		  });
	  });

	  context("Getting file with nested path", () => {
		  let response = it("Returns status 400", async () => {
			  let error;
			  try {
				  await request.get(`${host}/foldername/filename`, {
					  resolveWithFullResponse: true
				  });
			  } catch (err) {
				  error = err;
			  }
			  expect(error).to.exist;
			  if(error) {
				  expect(error.statusCode).to.equal(400);
			  }
		  });

	  });
  });

	/**
	 * Test deleting files
	 */
	context('Deleting files', () => {

		/**
		 * Put mock file in files folder before each test
		 */
		beforeEach(() => {
			fs.copyFileSync(config.get('fixturesRootDir') + '/file_mock.png', config.get('filesRootDir') + '/file_mock.png');
		});

		it('Deletes file', async () => {

			await request.delete('http://localhost:3001/file_mock.png');
			let error;
			try {
				fs.readFileSync(config.get('filesRootDir') + '/file_mock.png');
			} catch (err) {
				error = err;
			}
			expect(error).to.exist;
			if(error) {
				expect(error.code).to.equal('ENOENT');
			}
		});
	});

	/**
	 * Test sending files
	 */
	context('Sending files', () => {

		context('When file exists', () => {

			/**
			 * Clean files folder and put mock file in files folder before each test
			 */
			beforeEach(() => {
				fs.emptyDirSync(config.get('filesRootDir'));
				fs.copyFileSync(config.get('fixturesRootDir') + '/file_mock.png', config.get('filesRootDir') + '/file_mock.png');
			});

			it('Do not overwrite existing file & return status 409', async () => {

				let fileModTimeBefore = fs.statSync(config.get('filesRootDir') + '/file_mock.png').mtime;
				let error;
				try {
					await request.post(`${host}/file_mock.png`, {
						resolveWithFullResponse: true
					});
				} catch (err) {
					error = err;
				}
				let fileModTimeAfter = fs.statSync(config.get('filesRootDir')+ '/file_mock.png').mtime;

				expect(fileModTimeBefore).to.deep.equal(fileModTimeAfter);
				expect(error).to.exist;
				if(error) {
					expect(error.statusCode).to.equal(409);
				}
			});
		});

		context('When file does not exist', () => {

			/**
			 * Clean files folder and put mock file in files folder before each test
			 */
			beforeEach(() => {
				fs.emptyDirSync(config.get('filesRootDir'));
			});

			it('When file to big do not save one & return status 413', async () => {

				let req = request.post(`${host}/file_mock_big.jpeg`);
				let error;
				try {
					await fs.createReadStream(config.get('fixturesRootDir') + '/file_mock_big.jpeg').pipe(req);
				} catch (err) {
					error = err;
				}
				expect(error).to.exist;

				/** Ignore particular error codes because of node.js bug on windows with client and server launched on same machine
				 * For more info see e.g. https://github.com/nodejs/node/issues/947#issue-58838888
				 */
				if(error
					&& !error.toString().includes('ECONNRESET')
					&& !error.toString().includes('EPIPE')
					&& !error.toString().includes('ECANCELED')
				) {
					expect(error.statusCode).to.equal(413);
				}

				expect(fs.existsSync(config.get('filesRootDir') + '/file_mock_big.jpeg')).to.equal(false);
			});

			it('Save file in files folder', async () => {

				let req = request.post(`${host}/file_mock.png`);
				await fs.createReadStream(config.get('fixturesRootDir') + '/file_mock.png').pipe(req);

				expect
					(fs.readFileSync(config.get('fixturesRootDir') + '/file_mock.png'))
				.to.deep.equal
					(fs.readFileSync(config.get('filesRootDir') + '/file_mock.png'));

			});
		});
	});
});
