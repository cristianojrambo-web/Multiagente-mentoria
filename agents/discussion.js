const { AGENTS, streamAgentAnalysis, streamChairmanSummary } = require('./specialists');

async function withRetry(fn, agent, send, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.message?.includes('idle timeout') ||
        err.message?.includes('Stream idle') ||
        err.message?.includes('ECONNRESET') ||
        err.code === 'ECONNRESET' ||
        err.status === 529;
      if (isRetryable && attempt < maxAttempts) {
        send({
          type: 'retry',
          agentId: agent.id,
          attempt,
          message: `Reconectando ${agent.name}... (tentativa ${attempt + 1}/${maxAttempts})`,
        });
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function runBoardroomDiscussion({ problem, history = [], send }) {
  send({ type: 'phase', phase: 'initial', message: 'Fase 1: Análise inicial dos especialistas' });

  const initialAnalyses = [];
  for (const agent of AGENTS) {
    const text = await withRetry(
      () => streamAgentAnalysis({ agent, problem, phase: 'initial', send }),
      agent,
      send
    );
    initialAnalyses.push({ agentId: agent.id, agentName: agent.name, text });
  }

  send({ type: 'phase', phase: 'discussion', message: 'Fase 2: Debate e análise cruzada' });

  const discussionAnalyses = [];
  for (const agent of AGENTS) {
    const otherAnalyses = initialAnalyses
      .filter(a => a.agentId !== agent.id)
      .map(a => `${a.agentName}:\n${a.text}`)
      .join('\n\n---\n\n');

    const text = await withRetry(
      () => streamAgentAnalysis({ agent, problem, context: otherAnalyses, phase: 'discussion', send }),
      agent,
      send
    );
    discussionAnalyses.push({ agentId: agent.id, agentName: agent.name, text });
  }

  send({ type: 'phase', phase: 'summary', message: 'Fase 3: Síntese e recomendações do Chairman' });

  const allAnalyses = [...initialAnalyses, ...discussionAnalyses];
  const chairmanSummary = await withRetry(
    () => streamChairmanSummary({ problem, allAnalyses, send }),
    { id: 'chairman', name: 'Chairman' },
    send
  );

  send({
    type: 'approval_required',
    message: 'O conselho concluíu a análise. Deseja implementar as recomendações?',
    summary: chairmanSummary,
  });

  return { initialAnalyses, discussionAnalyses, chairmanSummary };
}

module.exports = { runBoardroomDiscussion };
