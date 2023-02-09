import * as fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { parseArgs, promisify } from 'util';
import { exec as _exec } from 'child_process';
const exec = promisify(_exec);
const bsvm = { version: '0.0.1' }; //import bsvm from '../package.json' assert { type: 'json' };

const remote_repo = 'dr-vortex/blankstorm',
	local_install_path = path.join(homedir(), '.bsvm/'),
	local_config_path = path.join(local_install_path, 'config.json'),
	global_config_path = local_config_path;

//load config
let config = {
	install_dir: path.join(local_install_path, 'installed'),
	git_dir: path.join(local_install_path, 'repo'),
};
if (fs.existsSync(local_config_path)) {
	const content = fs.readFileSync(local_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}
if (fs.existsSync(global_config_path)) {
	const content = fs.readFileSync(global_config_path, { encoding: 'utf-8' });
	Object.assign(config, JSON.parse(content));
}

const _args = parseArgs({
	options: {
		//BVM management
		help: { short: 'h', type: 'boolean' },
		version: { type: 'boolean' },
		update: { type: 'boolean' },
		install: { type: 'boolean' },

		//Command options
		verbose: { short: 'v', type: 'boolean' },
		force: { short: 'f', type: 'boolean' },
		'dry-run': { short: 'd', type: 'boolean' },
		'no-copy': { type: 'boolean' },
		mode: { short: 'm', type: 'string' },
		global: { short: 'g', type: 'boolean' },
		all: { short: 'a', type: 'boolean' },
	},
	allowPositionals: true,
});

const args = _args.positionals,
	options = {
		//BVM management
		help: false,
		version: false,
		update: false,
		install: false,

		//Command options
		verbose: false,
		force: false,
		'dry-run': false,
		'no-copy': false,
		mode: 'deploy',
		global: false,
		all: false,
		..._args.values,
	};

import * as git from 'isomorphic-git';
import * as http from 'isomorphic-git/http/node/index.js';
const git_options = {
	fs,
	http,
	dir: config.git_dir,
	dryRun: options['dry-run'],
	url: `https://github.com/${remote_repo}.git`,
	onMessage: msg => updateLastLine(msg, true),
	author: {
		name: 'bsvm',
		email: '',
	},
};

const verboseLog = (...data) => {
	if (options.verbose) {
		console.log(...data);
	}
};

const updateLastLine = (msg, verbose) => {
	if (!verbose || options.verbose) {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		process.stdout.write(msg);
	}
};

const updateRepo = async (ref = 'main') => {
	verboseLog('Updating local repository...');
	await git.pull({ ...git_options, ref });
};

const getVersions = async () => {
	verboseLog('Fetching releases...');
	const res = await fetch(`https://api.github.com/repos/${remote_repo}/releases`);
	return await res.json();
};

const convertTagToVersion = async tag_name => {
	const oid = await git.resolveRef({ ...git_options, ref: tag_name });
	const object = await git.readObject({ ...git_options, oid, format: 'parsed' });

	return {
		tag_name,
		name: object.type == 'tag' ? object.object.message : 'Unknown',
	};
};

if (options.version) {
	console.log(`BSVM v${bsvm.version}`);
	process.exit();
}

if (options.help || args[0] == 'help') {
	console.log(`BSVM usage:
	bsvm (--help | -h): Print this help message
	bsvm --version: Print the current version of BSVM
	bsvm --install: Install BSVM
	bsvm --update: Update BSVM (Not implemented yet)

	bsvm list: List installed versions of Blankstorm
		--all | -a: List all Blankstorm versions and whether they are downloaded or installed

	bsvm install [<version> ...]: Installs the specified version[s]
		--mode <value>: Command to use for installing (defaults to "deploy")
		--no-copy: Will not copy files if a <mode> command does not exist

	bsvm uninstall [<version> ...]: Uninstalls the specified version[s]
	bsvm update: Updates the local repository (downloads all Blankstorm versions)
	bsvm config <key> <value>: Sets the config <key> to <value>
		--global | -g: Applys the config change globally (not supported yet)


	bsvm <any command or flag command>:
		--verbose | -v: Output verbose/debug info
		--dry-run | -d: Run the command without changing files (not supported on most commands)
		--force | -f: Force command actions
	`);
	process.exit();
}

if (options.install) {
	console.log(`Installing BSVM (v${bsvm.version}) into ${local_install_path}...`);
	if (fs.existsSync(local_install_path) && !options.force) {
		console.log('BSVM installation already exists, use with --force or -f to force installation.');
		process.exit();
	}

	verboseLog('Creating directories...');
	fs.mkdirSync(path.join(local_install_path, 'repo'), { recursive: true });
	fs.mkdirSync(path.join(local_install_path, 'versions'), { recursive: true });
	verboseLog('Writing empty config file...');
	fs.writeFileSync(local_config_path, '{}');
	verboseLog('Cloning git repository...');
	await git.clone(git_options);
	console.log('Installation successful!');
	process.exit();
}

if (options.update) {
	console.log('CLI Update support not added. Please check https://github.com/dr-vortex/bsvm/releases');
}

switch (args[0]) {
	case 'install':
		await updateRepo(args[1]);
		const _tags = await git.listTags(git_options);
		let versionsToInstall = options.all ? _tags : args.slice(1);
		const _versions = await Promise.all(_tags.map(convertTagToVersion))
		for (let version of versionsToInstall) {
			try {
				const
					versionData = _versions.find(_version => _version.tag_name == version || _version.name == version),
					installPath = path.join(config.install_dir, versionData.tag_name);
				if (!versionData) {
					throw 'Version does not exist.';
				}

				verboseLog(`Checking out ${version}...`);
				await git.checkout({ ...git_options, ref: versionData.tag_name });

				if (!fs.existsSync(path.join(config.git_dir, 'package.json'))) {
					//old version that does not use NPM

					if(options['no-copy']){
						throw `Version has no "${options.mode}" command and --no-copy prevents copying.`;
					}

					fs.cpSync(config.git_dir, installPath, { recursive: true, force: options.force });
				} else {
					verboseLog('Checking for NPM...');
					const { stderr: checkError } = await exec(`${process.platform == 'win32' ? 'where' : 'which'} npm`);
					if (checkError) {
						throw 'Could not find NPM!' + (options.verbose ? `(${checkError})` : '');
					}

					console.log('Installing dependencies...');
					const { stderr: installError } = await exec('npm install', { cwd: config.git_dir });
					if (installError) {
						throw `Failed to install dependencies: ${installError}`;
					}

					verboseLog(`Checking for "${options.mode}" command...`);
					const content = fs.readFileSync(path.join(config.git_dir, 'package.json'), { encoding: 'utf-8' });
					let packageData;
					try {
						packageData = JSON.parse(content);
					} catch (err) {
						throw 'Invalid package.json (not JSON)';
					}

					if (!packageData.scripts[options.mode]) {
						console.log(`Could not find "${options.mode}" command ${options['no-copy'] ? ' (not attempting to copy)': ', copying instead...' }`);
						if(options['no-copy']){
							throw `Version has no "${options.mode}" command and --no-copy prevents copying.`;
						}
						fs.cpSync(config.git_dir, installPath, { recursive: true, force: options.force });
					} else {
						console.log('Deploying...');
						const { stdout: deployOut, stderr: deployError } = await exec(
							`${packageData.scripts[options.mode]} ${options.verbose ? '--verbose' : ''} --outDir="${installPath}"`,
							{ cwd: config.git_dir }
						);
						if (deployError) {
							throw `Couldn't deploy: ${deployError}`;
						} else {
							verboseLog(`deploy: ${deployOut}`);
						}
					}
				}
			} catch (err) {
				console.log(`Failed to install version "${version}": ${err}`);
			}
		}
		console.log('Done!');
		break;
	case 'uninstall':
		for (let version of args.slice(1)) {
			try {
				const versionPath = path.join(config.install_dir, version);
				if (!fs.existsSync(versionPath)) {
					throw 'Version is not installed.';
				}

				console.log(`Uninstalling ${version}...`);
				fs.rmdirSync(versionPath, { recursive: true, force: true });
			} catch (err) {
				console.log(`Failed to uninstall version "${version}": ${err}`);
			}
		}
		console.log('Done!');
		break;
	case 'update':
		console.log('Updating...');
		await updateRepo();
		console.log('Done!');
		break;
	case 'list':
		//fetch releases from GitHub
		let versions = [];
		try {
			versions = await getVersions();
		} catch (err) {
			console.log('Failed to fetch releases. Attempting to use local repository.');
		}

		let tags = [];
		try {
			tags = await git.listTags(git_options);

			versions = versions.length ? versions : await Promise.all(tags.map(convertTagToVersion));
		} catch (err) {
			console.log('Failed to get local tags.');
		}
		versions.reverse();
		for (let version of versions) {
			const isInstalled = fs.existsSync(path.join(config.install_dir, version.tag_name));

			if (options.all) {
				console.log(`${version.name} <${version.tag_name}> ${isInstalled ? '(installed)' : tags.includes(version.tag_name) ? '(downloaded)' : ''}`);
			} else if (isInstalled) {
				console.log(`${version.name} <${version.tag_name}>`);
			}
		}
		break;
	case 'config':
		const configPath = options.global ? global_config_path : local_config_path;
		if (options.global) {
			console.log('Warning: global config is not supported yet.');
		}
		let _config = {};
		if (!fs.existsSync(configPath)) {
			verboseLog(`No config file found at ${configPath}, creating.`);
		} else {
			const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
			Object.assign(_config, JSON.parse(content));
		}
		_config[args[1]] = args[2];
		fs.writeFileSync(configPath, JSON.stringify(_config));
		break;
	default:
		console.log(`Unsupported command: "${args[0]}"`);
}
