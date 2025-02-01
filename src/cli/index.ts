#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { lithiaVersion } from 'lithia/meta';
import { ProjectTemplate } from 'lithia/types';
import {
  info,
  pingVersion,
  ready,
  runPromiseStep,
  validateProjectName,
} from 'lithia/utils';
import { exec } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import { green } from 'lithia/utils';

const main = defineCommand({
  meta: {
    name: 'create-lithia-app',
    description: 'Create a new Lithia app',
    version: lithiaVersion,
  },
  async run() {
    const templates: ProjectTemplate[] = [
      {
        name: 'default',
        branch: 'main',
        url: 'https://github.com/lithiajs/lithia-default-app-template.git',
        description: 'Setup a Lithia.js app with no presets',
      },
      {
        name: 'with-drizzle',
        branch: 'main',
        url: 'https://github.com/lithiajs/lithia-with-drizzle-template.git',
        description: 'Setup a Lithia.js app using Drizzle ORM',
      },
      {
        name: 'with-prisma',
        branch: 'main',
        url: 'https://github.com/lithiajs/lithia-with-prisma-template.git',
        description: 'Setup a Lithia.js app using Prisma ORM',
      },
    ];

    const [npmInstalled, yarnInstalled, gitInstalled] = await Promise.all([
      pingVersion('npm'),
      pingVersion('yarn'),
      pingVersion('git'),
    ]);

    const answers = await prompts(
      [
        {
          name: 'pName',
          type: 'text',
          message: `What is the ${green('name')} of your project?`,
          initial: 'my-lithia-app',
          validate: validateProjectName,
          format: (v) => v.trim(),
        },
        {
          name: 'pTemplate',
          type: 'select',
          message: `Choose a ${green('template')} for your project`,
          choices: templates.map((t) => ({
            title: t.name,
            value: t,
            description: t.description,
          })),
        },
        {
          name: 'pInstallDeps',
          type: 'confirm',
          message: `Do you want to ${green('install')} dependencies after creating the project?`,
          initial: true,
        },
        {
          name: 'pInstallDepsManager',
          type: (prev: boolean) => (prev ? 'select' : null),
          message: `Choose a ${green('package manager')} to install dependencies`,
          choices: [
            { title: 'npm', value: 'npm', disabled: !npmInstalled },
            { title: 'yarn', value: 'yarn', disabled: !yarnInstalled },
          ],
        },
        {
          name: 'pGitInit',
          type: !gitInstalled ? null : 'confirm',
          message: `Do you want to ${green('initialize')} a git repository?`,
          initial: true,
        },
      ],
      {
        onCancel: () => {
          info('Operation cancelled');
          process.exit(0);
        },
      },
    );

    const dir = path.resolve(process.cwd(), answers.pName);
    const dirExists = await stat(dir).catch(() => null);

    if (dirExists) {
      const answer = await prompts({
        name: 'pOverwrite',
        type: 'confirm',
        message: `The directory ${green(answers.pName)} already exists. Do you want to overwrite it?`,
        initial: false,
      });

      if (answer.pOverwrite) {
        await rm(dir, { recursive: true });
      } else {
        info('Operation cancelled');
        process.exit(0);
      }
    }

    console.log();

    await mkdir(dir, { recursive: true });

    await runPromiseStep(
      () =>
        new Promise<void>((resolve, reject) => {
          exec(
            `git clone --branch ${answers.pTemplate.branch} ${answers.pTemplate.url} .`,
            { cwd: dir },
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          );
        }),
      'Cloning template repository...',
    );

    await runPromiseStep(async () => {
      await Promise.all([
        rm(path.resolve(dir, '.git'), { recursive: true }),
        rm(path.resolve(dir, 'package-lock.json'), { recursive: true }),
      ]);

      const pJson = await readFile(
        path.resolve(dir, 'package.json'),
        'utf-8',
      ).then((data) => JSON.parse(data));

      pJson.name = answers.pName;
      pJson.version = '0.1.0';

      delete pJson.description;

      await writeFile(
        path.resolve(dir, 'package.json'),
        JSON.stringify(pJson, null, 2),
      );
    }, 'Preparing workspace...');

    if (answers.pGitInit) {
      await runPromiseStep(
        () =>
          new Promise<void>((resolve, reject) => {
            exec('git init', { cwd: dir }, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
        'Initializing git repository...',
      );
    }

    if (answers.pInstallDeps) {
      await runPromiseStep(
        () =>
          new Promise<void>((resolve, reject) => {
            exec(
              `${answers.pInstallDepsManager} install`,
              { cwd: dir },
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              },
            );
          }),
        'Installing dependencies...',
      );
    }

    ready('Hold on, we are almost there!');
    const messages = [
      'Your project is ready to go, now you just need to run the following commands:',
      `├───> ${green(`cd ${answers.pName}`)}`,
      `└───> ${green(`${answers.pInstallDepsManager} run dev`)}`,
    ];

    messages.forEach((message) => info(message));

    process.exit(0);
  },
});

runMain(main).then();
