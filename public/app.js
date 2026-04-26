const form = document.getElementById('boardroom-form');
const problemInput = document.getElementById('problem-input');
const startBtn = document.getElementById('start-btn');
const boardroomEl = document.getElementById('boardroom');
const phaseEl = document.getElementById('phase-indicator');
const approvalEl = document.getElementById('approval-section');
const approveBtn = document.getElementById('approve-btn');
const rejectBtn = document.getElementById('reject-btn');

let agentBuffers = {};
let currentSummary = '';

function getOrCreateAgentCard(agent) {
  let card = document.getElementById(`agent-${agent.id}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `agent-${agent.id}`;
    card.className = 'agent-card';
    card.style.borderColor = agent.color;
    card.innerHTML = `
      <div class="agent-header" style="background:${agent.color}">
        <span class="agent-emoji">${agent.emoji}</span>
        <span class="agent-name">${agent.name}</span>
        <span class="agent-status" id="status-${agent.id}">aguardando...</span>
      </div>
      <div class="agent-body" id="body-${agent.id}"></div>
    `;
    boardroomEl.appendChild(card);
  }
  return card;
}

function setAgentStatus(agentId, status) {
  const el = document.getElementById(`status-${agentId}`);
  if (el) el.textContent = status;
}

function appendAgentText(agentId, text) {
  const el = document.getElementById(`body-${agentId}`);
  if (el) el.textContent += text;
}

function showPhase(message) {
  phaseEl.textContent = message;
  phaseEl.style.display = 'block';
}

function showApproval(summary) {
  currentSummary = summary;
  approvalEl.style.display = 'block';
  approvalEl.scrollIntoView({ behavior: 'smooth' });
}

function resetBoard() {
  boardroomEl.innerHTML = '';
  approvalEl.style.display = 'none';
  phaseEl.style.display = 'none';
  agentBuffers = {};
  currentSummary = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const problem = problemInput.value.trim();
  if (problem.length < 10) {
    alert('Descreva o problema com pelo menos 10 caracteres.');
    return;
  }

  resetBoard();
  startBtn.disabled = true;
  startBtn.textContent = 'Reunindo o conselho...';

  try {
    const response = await fetch('/api/boardroom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao iniciar sessão.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processChunk = ({ done, value }) => {
      if (done) {
        startBtn.disabled = false;
        startBtn.textContent = 'Iniciar Sessão';
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            handleEvent(data);
          } catch (_) {}
        }
      }

      reader.read().then(processChunk).catch(err => {
        console.warn('Stream interrompido, exibindo o que chegou:', err);
        startBtn.disabled = false;
        startBtn.textContent = 'Iniciar Sessão';
      });
    };

    reader.read().then(processChunk).catch(err => {
      console.error('Erro ao ler stream:', err);
      startBtn.disabled = false;
      startBtn.textContent = 'Iniciar Sessão';
    });

  } catch (err) {
    alert(`Erro: ${err.message}`);
    startBtn.disabled = false;
    startBtn.textContent = 'Iniciar Sessão';
  }
});

function handleEvent(data) {
  switch (data.type) {
    case 'phase':
      showPhase(data.message);
      break;

    case 'agent_start':
      getOrCreateAgentCard(data.agent);
      setAgentStatus(data.agent.id, 'analisando...');
      agentBuffers[data.agent.id] = '';
      break;

    case 'text':
      agentBuffers[data.agentId] = (agentBuffers[data.agentId] || '') + data.text;
      appendAgentText(data.agentId, data.text);
      break;

    case 'pulse':
      setAgentStatus(data.agentId, 'pensando...');
      break;

    case 'thinking_pulse':
      setAgentStatus(data.agentId, 'deliberando...');
      break;

    case 'agent_end':
      setAgentStatus(data.agentId, 'concluído ✓');
      break;

    case 'retry':
      setAgentStatus(data.agentId, data.message);
      break;

    case 'approval_required':
      showApproval(data.summary);
      break;

    case 'error':
      alert(`Erro do servidor: ${data.message}`);
      startBtn.disabled = false;
      startBtn.textContent = 'Iniciar Sessão';
      break;

    case 'done':
      startBtn.disabled = false;
      startBtn.textContent = 'Iniciar Sessão';
      break;
  }
}

approveBtn.addEventListener('click', () => {
  approvalEl.innerHTML = '<p class="approval-confirmed">✅ Recomendações aprovadas! O plano de ação está pronto para implementação.</p>';
});

rejectBtn.addEventListener('click', () => {
  approvalEl.innerHTML = '<p class="approval-rejected">❌ Sessão encerrada. Você pode iniciar uma nova análise com informações adicionais.</p>';
});
