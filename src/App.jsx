import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import "./App.css";

function qualidade(m) {
  if (m <= 10) return { texto: "Excelente (GPS)", nivel: "otima" };
  if (m <= 30) return { texto: "Boa (GPS)", nivel: "boa" };
  if (m <= 100) return { texto: "Regular (Torres/GPS)", nivel: "regular" };
  return { texto: "Aproximada (IP / Rede)", nivel: "baixa" };
}

const TEMAS = [
  { id: "geral", nome: "GPS Principal (Onde Estou)" },
  { id: "1", nome: "01 - EcoColeta (Descarte)" },
  { id: "2", nome: "02 - PetRadar (Alerta Animal)" },
  { id: "3", nome: "03 - AgroSolo (Amostra Agrícola)" },
  { id: "4", nome: "04 - DefesaAlerta (Defesa Civil)" },
  { id: "5", nome: "05 - BikeRota (Ciclovia/Trajeto)" },
  { id: "6", nome: "06 - FoodTruckFinder (Comércio Móvel)" },
  { id: "7", nome: "07 - ObraTracker (Ponto Operário)" },
  { id: "8", nome: "08 - HealthUrgence (Socorro Médico)" },
];

export default function App() {
  const [temaSelecionado, setTemaSelecionado] = useState("geral");
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy, hora, fonte, cidade }
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [detalhesTema, setDetalhesTema] = useState("");

  // Busca localização aproximada via IP (Fallback para PCs com GPS bloqueado)
  const obterPorIp = async () => {
    try {
      const resp = await fetch("https://ipwho.is/");
      const data = await resp.json();
      if (data && data.success && data.latitude && data.longitude) {
        return {
          lat: data.latitude,
          lng: data.longitude,
          accuracy: 1500,
          cidade: `${data.city || ""}, ${data.region || ""}`,
          fonte: "IP (Rede)",
          hora: new Date().toLocaleTimeString("pt-BR"),
        };
      }
    } catch {
      // Ignora e tenta o serviço secundário
    }

    const resp2 = await fetch("https://freeipapi.com/api/json");
    const data2 = await resp2.json();
    if (data2 && data2.latitude && data2.longitude) {
      return {
        lat: data2.latitude,
        lng: data2.longitude,
        accuracy: 2000,
        cidade: `${data2.cityName || ""}, ${data2.regionName || ""}`,
        fonte: "IP (Rede)",
        hora: new Date().toLocaleTimeString("pt-BR"),
      };
    }

    throw new Error("Não foi possível obter coordenadas nem por GPS nem por IP.");
  };

  const obterLocalizacao = async (forcarIp = false) => {
    setLoading(true);
    setErro("");
    setAviso("");

    if (forcarIp) {
      try {
        const dadosIp = await obterPorIp();
        setCoords(dadosIp);
        setAviso("📍 Localização obtida com sucesso via endereço IP.");
      } catch (err) {
        setErro(String(err?.message || err));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // 1. Verifica e solicita permissão nativa se estiver no Android/iOS
      if (Capacitor.isNativePlatform()) {
        let perm = await Geolocation.checkPermissions();
        if (perm.location !== "granted") {
          perm = await Geolocation.requestPermissions();
        }
        if (perm.location !== "granted") {
          throw new Error("Permissão de localização negada no dispositivo.");
        }
      }

      // 2. Captura posição com timeout de 8s no GPS
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });

      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        fonte: "Hardware GPS",
        cidade: "",
        hora: new Date(pos.timestamp).toLocaleTimeString("pt-BR"),
      });
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      console.warn("GPS indisponível, acionando fallback por IP:", msg);

      // 3. Fallback automático por IP se der timeout, bloqueio ou erro no navegador/PC
      try {
        setAviso("GPS sem sinal ou bloqueado no computador. Obtendo localização via IP...");
        const dadosIp = await obterPorIp();
        setCoords(dadosIp);
        setAviso("⚠️ GPS indisponível neste computador. Localização estimada via IP com sucesso!");
      } catch (ipErr) {
        if (msg.includes("timeout")) {
          setErro("Tempo esgotado no GPS e falha na consulta IP.");
        } else if (msg.includes("denied") || msg.includes("negada")) {
          setErro("Permissão negada e falha na consulta IP.");
        } else {
          setErro(`Falha ao obter localização: ${e?.message || e}`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const abrirNoMapa = () => {
    if (!coords) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    window.open(url, "_system");
  };

  const q = coords ? qualidade(coords.accuracy) : null;
  const estado = loading ? "buscando" : coords ? "ok" : "inicial";

  return (
    <main className="app">
      <header className="topo">
        <h1>Geolocalização Móvel</h1>
        <p>Capacitor GPS + React (com Fallback por IP)</p>
        
        <div className="seletor-tema">
          <label htmlFor="select-tema">Tema da Atividade:</label>
          <select 
            id="select-tema"
            value={temaSelecionado} 
            onChange={(e) => setTemaSelecionado(e.target.value)}
          >
            {TEMAS.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Radar Visual */}
      <section className={`radar radar--${estado}`} aria-hidden="true">
        <span className="anel anel--1" />
        <span className="anel anel--2" />
        <span className="anel anel--3" />
        <span className="ponto" />
      </section>

      {/* Alerta de Aviso / Fallback */}
      {aviso && (
        <div className="aviso" role="status">
          {aviso}
        </div>
      )}

      {/* Alerta de Erro */}
      {erro && (
        <div className="erro" role="alert">
          {erro}
        </div>
      )}

      {/* Exibição das Coordenadas */}
      {coords ? (
        <section className="leitura" aria-live="polite">
          <dl>
            <div>
              <dt>Latitude</dt>
              <dd>{coords.lat.toFixed(6)}°</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{coords.lng.toFixed(6)}°</dd>
            </div>
            <div>
              <dt>Precisão</dt>
              <dd>
                ±{coords.accuracy.toFixed(1)} m
                <span className={`selo selo--${q.nivel}`}>{q.texto}</span>
              </dd>
            </div>
            {coords.fonte && (
              <div>
                <dt>Origem do Sinal</dt>
                <dd style={{ fontSize: "0.95rem", color: "#38bdf8" }}>
                  {coords.fonte} {coords.cidade ? `(${coords.cidade})` : ""}
                </dd>
              </div>
            )}
          </dl>
          <p className="hora">Capturado às {coords.hora}</p>

          {/* Temas da Atividade */}
          {temaSelecionado === "1" && (
            <div className="card-negocio">
              <h3>♻️ EcoColeta - Ponto de Descarte</h3>
              <p>Coordenadas: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <input 
                type="text" 
                placeholder="Ex: Plástico, Vidro, Eletrônicos..."
                value={detalhesTema}
                onChange={e => setDetalhesTema(e.target.value)} 
              />
              <button className="btn btn--secundario" onClick={() => alert(`Coleta registrada: ${detalhesTema || 'Geral'} em [${coords.lat}, ${coords.lng}]`)}>
                Confirmar Ponto de Coleta
              </button>
            </div>
          )}

          {temaSelecionado === "2" && (
            <div className="card-negocio">
              <h3>🐾 PetRadar - Alerta de Pet</h3>
              <p>Último avistamento: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <input 
                type="text" 
                placeholder="Nome do pet ou raça..."
                value={detalhesTema}
                onChange={e => setDetalhesTema(e.target.value)} 
              />
              <button className="btn btn--secundario" onClick={() => alert(`Alerta criado para "${detalhesTema}" na posição informada.`)}>
                Emitir Alerta Pet
              </button>
            </div>
          )}

          {temaSelecionado === "3" && (
            <div className="card-negocio">
              <h3>🌱 AgroSolo - Amostra Agrícola</h3>
              <p>Gleba: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <input 
                type="text" 
                placeholder="Identificação do talhão..."
                value={detalhesTema}
                onChange={e => setDetalhesTema(e.target.value)} 
              />
              <button className="btn btn--secundario" onClick={() => alert(`Amostra do talhão ${detalhesTema} gravada.`)}>
                Salvar Amostra de Solo
              </button>
            </div>
          )}

          {temaSelecionado === "4" && (
            <div className="card-negocio">
              <h3>🚨 DefesaAlerta - Ocorrência Defesa Civil</h3>
              <p>Ponto de risco: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <input 
                type="text" 
                placeholder="Tipo: Enchente, Deslizamento..."
                value={detalhesTema}
                onChange={e => setDetalhesTema(e.target.value)} 
              />
              <button className="btn btn--alerta" onClick={() => alert(`Ocorrência de ${detalhesTema || 'Risco'} despachada!`)}>
                Enviar Alerta Imediato
              </button>
            </div>
          )}

          {temaSelecionado === "5" && (
            <div className="card-negocio">
              <h3>🚴 BikeRota - Check-in do Trajeto</h3>
              <p>Ponto da rota: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <button className="btn btn--secundario" onClick={() => alert(`Ponto registrado na rota!`)}>
                Gravar Ponto da Rota
              </button>
            </div>
          )}

          {temaSelecionado === "6" && (
            <div className="card-negocio">
              <h3>🚚 FoodTruckFinder - Atualizar Ponto</h3>
              <p>Posição atual: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <button className="btn btn--secundario" onClick={() => alert(`Localização pública do Food Truck atualizada!`)}>
                Publicar Localização
              </button>
            </div>
          )}

          {temaSelecionado === "7" && (
            <div className="card-negocio">
              <h3>🏗️ ObraTracker - Ponto Operário</h3>
              <p>Localização: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <button className="btn btn--secundario" onClick={() => alert(`Ponto eletrônico registrado na coordenada da obra!`)}>
                Bater Ponto
              </button>
            </div>
          )}

          {temaSelecionado === "8" && (
            <div className="card-negocio">
              <h3>🚑 HealthUrgence - Resgate Médico</h3>
              <p>Local do socorro: [{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}]</p>
              <button className="btn btn--alerta" onClick={() => alert(`Coordenadas despachadas para o SAMU!`)}>
                Solicitar Ambulância
              </button>
            </div>
          )}
        </section>
      ) : (
        !erro && !aviso && (
          <p className="vazio">
            Pressione o botão abaixo para capturar sua posição via GPS. Se estiver em um computador com GPS bloqueado, a localização será obtida via IP automaticamente.
          </p>
        )
      )}

      {/* Botões de Ação */}
      <footer className="acoes">
        <button
          className="btn btn--principal"
          onClick={() => obterLocalizacao(false)}
          disabled={loading}
        >
          {loading
            ? "Buscando localização..."
            : coords
            ? "Atualizar Localização"
            : "Obter Localização"}
        </button>

        {coords && (
          <button className="btn btn--mapa" onClick={abrirNoMapa}>
            🗺️ Abrir no Google Maps
          </button>
        )}

        <button
          className="btn btn--secundario"
          style={{ fontSize: "0.85rem", opacity: 0.85 }}
          onClick={() => obterLocalizacao(true)}
          disabled={loading}
        >
          🌐 Forçar Captura por IP (Computador)
        </button>
      </footer>
    </main>
  );
}
