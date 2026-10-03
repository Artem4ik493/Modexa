export interface StatsCardInput {
  communityName: string;
  members: number;
  activeCases: number;
  totalCases: number;
}

export interface ProfileCardInput {
  displayName: string;
  userId: string;
  accounts: string;
}

export class CardImageService {
  constructor(
    private readonly providerBaseUrl = "https://quickchart.io/chart"
  ) {}

  stats(input: StatsCardInput): string {
    return this.url({
      type: "bar",
      data: {
        labels: ["Участники", "Активные кейсы", "Всего кейсов"],
        datasets: [{
          data: [input.members, input.activeCases, input.totalCases],
          backgroundColor: ["#8b5cf6", "#ffb454", "#5b8cff"],
          borderRadius: 14
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: input.communityName,
            color: "#f4f7ff",
            font: { size: 28, weight: "bold" }
          },
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: "#aeb8ce" }, grid: { display: false } },
          y: { ticks: { color: "#7f8aa3" }, grid: { color: "#202a42" }, beginAtZero: true }
        }
      }
    });
  }

  profile(input: ProfileCardInput): string {
    return this.url({
      type: "bar",
      data: {
        labels: ["Modexa"],
        datasets: [{
          data: [1],
          backgroundColor: ["#8b5cf6"]
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: input.displayName,
            color: "#f4f7ff",
            font: { size: 32, weight: "bold" }
          },
          subtitle: {
            display: true,
            text: [input.userId, input.accounts],
            color: "#aeb8ce",
            font: { size: 16 }
          },
          legend: { display: false }
        },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  }

  private url(config: Record<string, unknown>): string {
    const query = new URLSearchParams({
      width: "1200",
      height: "630",
      format: "png",
      backgroundColor: "#070a12",
      c: JSON.stringify(config)
    });
    return `${this.providerBaseUrl}?${query.toString()}`;
  }
}
