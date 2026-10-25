// b2b/require-endpoint-access (F1.8b, F1.8-AC8, AGENTS kural 2): `@Controller` sınıfındaki her HTTP
// metodu erişim işaretlerinden TAM BİRİNİ taşır: @RequirePermission, @Public, @Authenticated,
// @RequirePlatformRole. İşaretsiz metot çalışma anında da reddedilir (AccessGuard varsayılan
// reddet); bu kural hatayı birleştirmeden önce yakalar.

const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
]);
const ACCESS_DECORATORS = new Set([
  'RequirePermission',
  'Public',
  'Authenticated',
  'RequirePlatformRole',
]);

/** `@Get()`, `@Get`, `@x.Get()` → 'Get'. */
function decoratorName(decorator) {
  let expression = decorator.expression;
  if (expression.type === 'CallExpression') expression = expression.callee;
  if (expression.type === 'Identifier') return expression.name;
  if (expression.type === 'MemberExpression' && expression.property.type === 'Identifier') {
    return expression.property.name;
  }
  return undefined;
}

function names(node) {
  return (node.decorators ?? []).map(decoratorName).filter((name) => name !== undefined);
}

/** @type {import('eslint').Rule.RuleModule} */
export const requireEndpointAccess = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Her controller uç noktası tam bir erişim işareti taşır (AGENTS kural 2).',
    },
    schema: [],
    messages: {
      missing:
        '"{{method}}" uç noktasında erişim işareti yok: @RequirePermission, @Public, @Authenticated veya @RequirePlatformRole ekle (AGENTS kural 2).',
      multiple:
        '"{{method}}" uç noktasında birden fazla erişim işareti var ({{found}}); tam bir tane olmalı.',
    },
  },
  create(context) {
    return {
      ClassDeclaration(node) {
        if (!names(node).includes('Controller')) return;
        for (const member of node.body.body) {
          if (member.type !== 'MethodDefinition') continue;
          const decorators = names(member);
          if (!decorators.some((name) => HTTP_DECORATORS.has(name))) continue;
          const found = decorators.filter((name) => ACCESS_DECORATORS.has(name));
          const method =
            member.key.type === 'Identifier'
              ? member.key.name
              : context.sourceCode.getText(member.key);
          if (found.length === 0) {
            context.report({ node: member, messageId: 'missing', data: { method } });
          } else if (found.length > 1) {
            context.report({
              node: member,
              messageId: 'multiple',
              data: { method, found: found.join(', ') },
            });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: 'b2b' },
  rules: { 'require-endpoint-access': requireEndpointAccess },
};
