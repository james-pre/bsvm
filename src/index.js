import * as fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { parseArgs } from 'util';
const bsvm = { version: '0.0.1' }; //import bsvm from '../package.json' assert { type: 'json' };
import gitClone from 'git-clone/promise';

const local_install_path = path.join(homedir(), '.bsvk/'),
	local_config_path = path.join(local_install_path, 'config.json'),
	global_config_path = local_config_path;

let config = {};
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
		installDir: { short: 'i', type: 'string' },
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
		installDir: config.install_dir,
		global: false,
		all: false,
		..._args.values,
	};

const verboseLog = (...data) => {
	if (options.verbose) {
		console.log(...data);
	}
};

if (options.version) {
	console.log(`BSVM v${bsvm.version}`);
	process.exit();
}

if (options.help) {
	console.log(`BSVM usage:
	bsvm (--help | -h): Print this help message
	bsvm --version: Print the current version of BSVM
	bsvm --install: Install BSVM
	bsvm --update: Update BSVM
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
	verboseLog('Writing empty config file...');
	fs.writeFileSync(local_config_path, '{}');
	verboseLog('Cloning git repository...');
	gitClone('https://github.com/dr-vortex/blankstorm.git', path.join(local_install_path, 'repo')).then(() => {
		console.log('Installation successful!');
		process.exit();
	});
}

if (options.update) {
	console.log('CLI Update support not added. Please check https://github.com/dr-vortex/bsvm/releases');
}

switch (args[0]) {
	case 'install':
		args.shift();
		break;
	case 'uninstall':
		args.shift();
		break;
	case 'list':
		break;
	case 'config':
		const configPath = options.global ? global_config_path : local_config_path;
		if (options.global) {
			console.log('Warning: global config is not supported yet.');
		}
		let _config = {};
		if (!fs.existsSync(configPath) && options.verbose) {
			console.log(`No config file found at ${configPath}, creating.`);
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
