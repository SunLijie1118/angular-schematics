import {
    Rule, Tree,
    SchematicContext, SchematicsException
} from '@angular-devkit/schematics';
import * as ts from 'typescript';

export function update(): Rule {
    return (_tree: Tree, _context: SchematicContext) => {
        // 解析angular项目
        const workspaceConfigBuffer = _tree.read('angular.json');
        if (!workspaceConfigBuffer) {
            throw new SchematicsException('Not an Angular CLI workspace.');
        }
        const packageData =JSON.parse(_tree.read('package.json')!.toString('utf-8'));

        const workspaceConfig = JSON.parse(workspaceConfigBuffer.toString());
        const projectName = workspaceConfig.defaultProject || packageData.name;
        const project = workspaceConfig.projects[projectName];
        const defaultProjectPath = buildDefaultPath(project);

        // 把app.component.ts转成Typescript AST
        const componentPath = `${defaultProjectPath}/app.component.ts`;
        const componentSourceFile = readIntoSourceFile(_tree, componentPath);

        // 找出title变量
        const classDeclaration = componentSourceFile.statements.find(node => ts.isClassDeclaration(node))! as ts.ClassDeclaration;
        const allProperties = classDeclaration.members.filter(node => ts.isPropertyDeclaration(node))! as ts.PropertyDeclaration[];
        const titleProperty = allProperties.find(node => node.name.getText() === 'title');

        // 如果有找到title变量，则修改它的值
        if (titleProperty) {
            const initialLiteral = titleProperty.initializer as ts.StringLiteral;
            const componentRecorder = _tree.beginUpdate(componentPath);
            const startPos = initialLiteral.getStart();
            componentRecorder.remove(startPos, initialLiteral.getWidth());
            componentRecorder.insertRight(startPos, '\'Angular demo 0.0.2\'');
            _tree.commitUpdate(componentRecorder);
        }
        return _tree;
    }
}

function buildDefaultPath(project: any): any {
    const root = project.sourceRoot ? `/${project.sourceRoot}/` : `/${project.root}/src/`;
    const projectDirName =
        project['projectType'] === 'application' ? 'app' : 'lib';

    return `${root}${projectDirName}`;
}

// 读取文件
function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
    const text = host.read(modulePath);
    if (text === null) {
        throw new SchematicsException(`File ${modulePath} does not exist.`);
    }
    const sourceText = text.toString('utf-8');
    return ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);
}