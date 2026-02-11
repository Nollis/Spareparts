<script>
  export let language = "se";

  const copy = {
    se: {
      hero: "VÄLKOMMEN TILL SWEPACS RESERVDELSPORTAL",
      title: "RESERVDELAR",
      intro: "Enklast och bekvämast är att beställa via Reservdelsportalen.",
      webOrderTitle: "Web-beställning",
      webOrderBody:
        'Klicka på Reservdelar eller Konto i menyraden högst upp\n\nFör webbeställning av reservdelar klickar du på "Alla produkter" och väljer produkttyp, därefter guidas du fram via tydliga sprängskisser över produkterna, väljer reservdel(ar) och antal samt går vidare till kunddata och leveransadress.',
      ljungbyTitle: "Order Ljungby",
      ljungbyBody:
        "Öppettider i samband med Jul och Nyår\nTisdagen den 23.12 stänger vi kl.12.00\nFredag den 2.1.2026 stängt\nÖvriga dagar öppet som vanligt.\n\nMåndag-Torsdag 08.00-16.00\n\nFredag 08.00-15.00",
      vasbyTitle: "Serviceverkstad Upplands Väsby",
      vasbyBody:
        "Öppettider serviceverkstad i Upplands Väsby Jul och Nyår\nStängt mellan 2025.12.22 till 2026.01.02\nÖppnar igen 2026.01.05\n\nMåndag-Torsdag 7.00-16.30\n\nFredag 7.00-14.00",
      innovationTitle: "Innovation och hög produktkvalitet",
      innovationBody:
        "Swepac är ett ledande helsvenskt företag som utvecklar och tillverkar produkter för jordpackning och betongbearbetning. Produkterna är utvecklade i nära samarbete med kunder och har starkt fokus på funktion, säkerhet, god ergonomi, hög kvalitet och ett medvetet miljötänkande.",
    },
    en: {
      hero: "WELCOME TO SWEPAC'S SPARE PARTS PORTAL",
      title: "SPARE PARTS",
      intro: "The easiest way is to order via the Spare Parts Portal.",
      webOrderTitle: "Web Ordering",
      webOrderBody:
        'Click on Spare Parts or Account in the top menu.\n\nFor web ordering of spare parts, click on "All products" and select the product type, then you will be guided via clear exploded views of the products, select spare part(s) and quantity and proceed to customer data and delivery address.',
      ljungbyTitle: "Order Ljungby",
      ljungbyBody:
        "Opening hours during Christmas and New Year\nTuesday 23.12 closing at 12.00\nFriday 2.1.2026 closed\nOther days open as usual.\n\nMonday-Thursday 08.00-16.00\n\nFriday 08.00-15.00",
      vasbyTitle: "Service Workshop Upplands Väsby",
      vasbyBody:
        "Service workshop opening hours Upplands Väsby Christmas and New Year\nClosed between 2025.12.22 to 2026.01.02\nOpens again 2026.01.05\n\nMonday-Thursday 7.00-16.30\n\nFriday 7.00-14.00",
      innovationTitle: "Innovation and high product quality",
      innovationBody:
        "Swepac is a leading all-Swedish company that develops and manufactures products for soil compaction and concrete processing. The products are developed in close cooperation with customers and have a strong focus on function, safety, good ergonomics, high quality and conscious environmental thinking.",
    },
    pl: {
      hero: "WITAMY W PORTALU CZĘŚCI ZAMIENNYCH SWEPAC",
      title: "CZĘŚCI ZAMIENNE",
      intro: "Najwygodniej zamawiać przez portal części zamiennych.",
      webOrderTitle: "Zamówienia internetowe",
      webOrderBody:
        'Kliknij Części zamienne lub Konto w górnym menu.\n\nAby zamówić części zamienne przez internet, kliknij "Wszystkie produkty" i wybierz typ produktu. Następnie zostaniesz poprowadzony przez czytelne schematy produktów, wybierz część(i) i ilość, a następnie przejdź do danych klienta i adresu dostawy.',
      ljungbyTitle: "Zamówienia Ljungby",
      ljungbyBody:
        "Godziny otwarcia w okresie świąteczno-noworocznym\nWtorek 23.12 zamykamy o 12.00\nPiątek 2.1.2026 nieczynne\nPozostałe dni otwarte jak zwykle.\n\nPoniedziałek-Czwartek 08.00-16.00\n\nPiątek 08.00-15.00",
      vasbyTitle: "Warsztat serwisowy Upplands Väsby",
      vasbyBody:
        "Godziny otwarcia warsztatu serwisowego Upplands Väsby Boże Narodzenie i Nowy Rok\nZamknięte od 2025.12.22 do 2026.01.02\nOtwarte ponownie 2026.01.05\n\nPoniedziałek-Czwartek 7.00-16.30\n\nPiątek 7.00-14.00",
      innovationTitle: "Innowacja i wysoka jakość produktów",
      innovationBody:
        "Swepac to wiodąca szwedzka firma, która opracowuje i produkuje produkty do zagęszczania gruntu i obróbki betonu. Produkty są opracowywane w ścisłej współpracy z klientami i kładą duży nacisk na funkcjonalność, bezpieczeństwo, dobrą ergonomię, wysoką jakość i świadome myślenie ekologiczne.",
    },
  };

  $: t = copy[language] || copy.se;

  function nl2br(text) {
    if (!text) return "";
    return text.replace(/\n/g, "<br>");
  }
</script>

<section class="hero">
  <div class="container">
    <p>{t.hero}</p>
  </div>
</section>

<section class="intro">
  <div class="container">
    <div class="home-content">
      <h1>{t.title}</h1>
      <p class="lead">{t.intro}</p>

      <div class="info-block">
        <h3>{t.webOrderTitle}</h3>
        <p>{@html nl2br(t.webOrderBody)}</p>
      </div>

      <div class="info-block">
        <h3>{t.ljungbyTitle}</h3>
        <p>{@html nl2br(t.ljungbyBody)}</p>
      </div>

      <div class="info-block">
        <h3>{t.vasbyTitle}</h3>
        <p>{@html nl2br(t.vasbyBody)}</p>
      </div>

      <div class="split-feature">
        <div class="text">
          <h3>{t.innovationTitle}</h3>
          <p>{@html nl2br(t.innovationBody)}</p>
        </div>
        <div class="image">
          <img src="/design/assets/machine.jpg" alt="Swepac Machine" />
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .lead {
    font-size: 1.1em;
    margin-bottom: 2rem;
  }
  .info-block {
    margin-bottom: 2rem;
  }
  .info-block h3 {
    margin-bottom: 0.5rem;
    font-size: 1.1em;
    font-weight: bold;
    color: #222;
  }
  .info-block p {
    line-height: 1.6;
    color: #444;
  }
  .split-feature {
    display: flex;
    gap: 40px;
    margin-top: 40px;
    align-items: flex-start;
  }
  .split-feature .text {
    flex: 1;
  }
  .split-feature .image {
    flex: 0 0 400px;
    max-width: 100%;
  }
  .split-feature img {
    width: 100%;
    height: auto;
    border-radius: 4px;
    display: block;
  }
  @media (max-width: 800px) {
    .split-feature {
      flex-direction: column;
    }
    .split-feature .image {
      flex: 1;
      width: 100%;
    }
  }
</style>
