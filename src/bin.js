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
	install_dir: path.join(local_install_path, 'versions'),
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

//parse CLI arguements
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

const args = _args.positionals;
const options = {
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

//load git
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

//globals
let tags = [], versions = [];

//utilities
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
	tags = await git.listTags(git_options);
};

const updateVersions = async () => {
	versions = await getVersions();
}

const getVersions = async (useLocal) => {

	if(useLocal){
		return await Promise.all(tags.map(convertTagToVersion));
	}else{
		try{
		verboseLog('Fetching releases...');
		const res = await fetch(`https://api.github.com/repos/${remote_repo}/releases`);
		return await res.json();
		}catch(err){
			console.log('Failed to fetch releases. Attempting to use local repository.');
			try{
				return await Promise.all(tags.map(convertTagToVersion));
			}catch(err){
				console.log('Failed to get local tags.');
			}
		}
	}
};

const convertTagToVersion = async tag_name => {
	const oid = await git.resolveRef({ ...git_options, ref: tag_name });
	const object = await git.readObject({ ...git_options, oid, format: 'parsed' });

	return {
		tag_name,
		name: object.type == 'tag' ? object.object.message : 'Unknown',
	};
};

const resolveVersions = (_versions) => _versions.flatMap(_version => versions.filter(version => version.tag_name.includes(_version) || version.name.includes(_version)));

const installDir = (from, to) => {
	fs.cpSync(from, to, { recursive: true, force: true });
	verboseLog('Cleaning up...');
	for(let name in [ '.git', 'node_modules', 'package.json', 'package-lock.json']){
		fs.rmSync(path.join(to, name), { recursive: true, force: true });
	}
}

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
	fs.mkdirSync(config.git_dir, { recursive: true });
	fs.mkdirSync(config.install_dir, { recursive: true });
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
		await updateRepo();
		await updateVersions();
		const versionsToInstall = options.all ? versions : resolveVersions(args.slice(1));
		for (let version of versionsToInstall) {
			try {
				const installPath = path.join(config.install_dir, version.tag_name);
				if (!version) {
					throw 'Version does not exist.';
				}

				verboseLog(`Checking out ${version.tag_name}...`);
				await git.checkout({ ...git_options, ref: version.tag_name });

				if (!fs.existsSync(path.join(config.git_dir, 'package.json'))) {
					//old version that does not use NPM

					if(options['no-copy']){
						throw `Version has no "${options.mode}" command and --no-copy prevents copying.`;
					}

					installDir(config.git_dir, installPath);
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
						installDir(config.git_dir, installPath);
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
		await updateRepo();
		await updateVersions();
		const versionsToUninstall = options.all ? versions : resolveVersions(args.slice(1));
		for (let version of versionsToUninstall) {
			try {
				const versionPath = path.join(config.install_dir, version.tag_name);
				if (!fs.existsSync(versionPath)) {
					throw 'Version is not installed.';
				}

				console.log(`Uninstalling ${version.tag_name}...`);
				fs.rmSync(versionPath, { recursive: true, force: true });
			} catch (err) {
				console.log(`Failed to uninstall version "${version}": ${err}`);
			}
		}
		console.log('Done!');
		break;
	case 'update':
		console.log('Updating...');
		await updateRepo();
		await updateVersions();
		console.log('Done!');
		break;
	case 'list':
		//fetch releases from GitHub
		let _versions = [];
		try {
			_versions = await getVersions();
		} catch (err) {
			console.log('Failed to fetch releases. Attempting to use local repository.');
		}
		_versions.reverse();
		for (let version of _versions) {
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
