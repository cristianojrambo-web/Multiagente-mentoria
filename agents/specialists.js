const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 600000,
  maxRetries: 2,
});

const AGENTS = [
  {
    id: 'finance',
    name: 'CFO - Diretor Financeiro',
    emoji: '💰',
    color: '#2ecc71',
    role: 'finance',
    initialPrompt: `Você é o CFO (Chief Financial Officer) de uma empresa consultora de elite.\nAnalise o problema empresarial apresentado com foco em:\n- Impacto financeiro (custos, receitas, fluxo de caixa, ROI)\n- Riscos financeiros e mitigação\n- Viabilidade econômica das soluções\n- Métricas financeiras relevantes\nSeja direto, use dados e números quando possível. Máximo 300 palavras.`,
    discussionPrompt: `Você é o CFO em uma reunião de conselho.\nBaseado nas análises dos outros mentores, complemente ou questione sob perspectiva financeira.\nSeja construtivo mas rigoroso com números. Máximo 200 palavras.`,
  },
  {
    id: 'marketing',
    name: 'CMO - Diretor de Marketing',
    emoji: '📢',
    color: '#e74c3c',
    role: 'marketing',
    initialPrompt: `Você é o CMO (Chief Marketing Officer) de uma empresa consultora de elite.\nAnalise o problema empresarial apresentado com foco em:\n- Posicionamento de marca e percepção de mercado\n- Estratégias de aquisição e retenção de clientes\n- Oportunidades de crescimento e expansão\n- Tendências de mercado e comportamento do consumidor\nSeja criativo e orientado a resultados. Máximo 300 palavras.`,
    discussionPrompt: `Você é o CMO em uma reunião de conselho.\nBaseado nas análises anteriores, adicione perspectiva de marketing e clientes.\nConecte as soluções ao mercado e aos clientes reais. Máximo 200 palavras.`,
  },
  {
    id: 'sales',
    name: 'CSO - Diretor de Vendas',
    emoji: '🎯',
    color: '#f39c12',
    role: 'sales',
    initialPrompt: `Você é o CSO (Chief Sales Officer) de uma empresa consultora de elite.\nAnalise o problema empresarial apresentado com foco em:\n- Pipeline de vendas e conversão\n- Estratégias comerciais e pricing\n- Relacionamento com clientes e parceiros\n- Metas e KPIs de vendas\nSeja pragmático e focado em resultados concretos. Máximo 300 palavras.`,
    discussionPrompt: `Você é o CSO em uma reunião de conselho.\nBaseado nas análises anteriores, traga perspectiva comercial e de vendas.\nFoque no que pode ser vendido e como. Máximo 200 palavras.`,
  },
  {
    id: 'management',
    name: 'COO - Diretor de Operações',
    emoji: '⚙️',
    color: '#9b59b6',
    role: 'management',
    initialPrompt: `Você é o COO (Chief Operations Officer) de uma empresa consultora de elite.\nAnalise o problema empresarial apresentado com foco em:\n- Eficiência operacional e processos\n- Gestão de pessoas e equipes\n- Tecnologia e infraestrutura\n- Execução e implementação de mudanças\nSeja estruturado e focado em execução. Máximo 300 palavras.`,
    discussionPrompt: `Você é o COO em uma reunião de conselho.\nBaseado nas análises anteriores, traga perspectiva operacional e de execução.\nComo isso será implementado na prática? Máximo 200 palavras.`,
  },
  {
    id: 'strategy',
    name: 'CSO - Diretor de Estratégia',
    emoji: '🔭',
    color: '#1abc9c',
    role: 'strategy',
    initialPrompt: `Você é o Chief Strategy Officer de uma empresa consultora de elite.\nAnalise o problema empresarial apresentado com foco em:\n- Visão de longo prazo e posicionamento competitivo\n- Análise SWOT e forças do mercado\n- Inovação e diferenciação estratégica\n- Alinhamento entre objetivos e capacidades\nPense de forma sistêmica e estratégica. Máximo 300 palavras.`,
    discussionPrompt: `Você é o Chief Strategy Officer em uma reunião de conselho.\nBaseado nas análises anteriores, sintetize e questione estrategicamente.\nComo isso se alinha com a estratégia de longo prazo? Máximo 200 palavras.`,
  },
];

const CHAIRMAN = {
  id: 'chairman',
  name: 'Chairman - Presidente do Conselho',
  emoji: '👔',
  color: '#2c3e50',
  role: 'chairman',
  summaryPrompt: `Você é o Chairman (Presidente do Conselho) de uma empresa consultora de elite.\nApós ouvir todos os mentores especialistas, sua função é:\n1. Sintetizar as principais perspectivas apresentadas\n2. Identificar consensos e divergências importantes\n3. Formular 3-5 recomendações estratégicas claras e priorizadas\n4. Apresentar um plano de ação com próximos passos concretos\n5. Fazer perguntas de esclarecimento ao empresário se necessário\n\nSeja presidencial: autoritativo, claro, decisivo. Máximo 500 palavras.`,
};

async function streamAgentAnalysis({ agent, problem, context = '', phase, send }) {
  send({
    type: 'agent_start',
    phase,
    agent: { id: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color },
  });

  const systemPrompt = phase === 'initial' ? agent.initialPrompt : agent.discussionPrompt;
  const userMessage = phase === 'initial'
    ? `Problema empresarial para análise:\n\n${problem}`
    : `Problema original:\n${problem}\n\nAnálises anteriores dos colegas:\n${context}\n\nSua análise complementar:`;

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    stream: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  for await (const event of response) {
    if (event.type === 'message_start' || event.type === 'content_block_start') {
      send({ type: 'pulse', agentId: agent.id });
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      send({ type: 'text', agentId: agent.id, text: event.delta.text });
    }
  }

  send({ type: 'agent_end', agentId: agent.id });
  return fullText;
}

async function streamChairmanSummary({ problem, allAnalyses, send }) {
  send({
    type: 'agent_start',
    phase: 'summary',
    agent: { id: CHAIRMAN.id, name: CHAIRMAN.name, emoji: CHAIRMAN.emoji, color: CHAIRMAN.color },
  });

  const context = allAnalyses.map(a => `**${a.agentName}:**\n${a.text}`).join('\n\n---\n\n');
  const userMessage = `Problema empresarial:\n${problem}\n\nAnálises do conselho:\n\n${context}\n\nSua síntese e recomendações finais:`;

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    stream: true,
    system: CHAIRMAN.summaryPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  for await (const event of response) {
    if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
      send({ type: 'thinking_pulse', agentId: CHAIRMAN.id });
    }
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      send({ type: 'text', agentId: CHAIRMAN.id, text: event.delta.text });
    }
  }

  send({ type: 'agent_end', agentId: CHAIRMAN.id });
  return fullText;
}

module.exports = { AGENTS, CHAIRMAN, streamAgentAnalysis, streamChairmanSummary };
